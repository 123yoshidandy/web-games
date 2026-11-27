/**
 * 画面（タイトル・ゲーム・シート）
 * 画面はビューだけを見て描く。操作はコントローラーの send(seat, command) に渡す
 */

import LocalGameController, { loadSavedGame, clearSavedGame, CPU_STEP_DELAY_MS } from './game-controller.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import {
    CITIES, NEIGHBORS, COLOR_NAMES, ROLES, EVENTS, LEVELS, INFECTION_RATES, MAX_OUTBREAKS, MAX_STATIONS, HAND_LIMIT,
    isCityCard, isEventCard, eventOf, cardColor, cardName
} from './cities.js';
import { mapSvg, miniMapSvg, shortestPath, DISEASE_COLORS } from './map.js';
import { HELP_HTML } from './help.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult } from './netplay/user-stats.js';
import { getServerUrl, GAME } from './online-config.js';

// オンラインのコントローラーを、画面が使うローカルの形（send(seat, command)・canControl(seat) など）に合わせる
// オンラインでは自分の席だけを動かす。ヒント・任せる・自動で進める処理はない
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
        assist: () => false,
        scheduleCpu() {},
        scheduleAuto() {},
        stop: () => net.stop()
    };
}

// 自分の操作の音（コマンドの種類ごと）
const COMMAND_SOUND = {
    drive: 'place', direct: 'place', charter: 'place', shuttle: 'place', dispatch: 'place', opsmove: 'place', build: 'place', event: 'place', forecast: 'place',
    treat: 'capture', cure: 'gain', take: 'gain', retrieve: 'gain', give: 'pay', discard: 'pay',
    draw: 'draw', infect: 'draw', intensify: 'shuffle', continue: 'select', pass: 'select'
};

const SETTINGS_KEY = 'pandemic.settings';
const CPU_NAMES = ['ハル', 'ミナ', 'ソラ'];
const ROLE = Object.fromEntries(ROLES.map(r => [r.key, r]));
// ヒントが指す場面（手を打つと変わる）
const hintKey = (v) => JSON.stringify([v.logTotal, v.phase, v.actionsLeft, v.current, v.players.map(p => `${p.city}:${p.hand.length}`)]);

const $ = (id) => document.getElementById(id);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ICONS = {
    home: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/></svg>',
    help: '<svg viewBox="0 0 24 24" class="line-icon"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>',
    log: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    assist: '<svg viewBox="0 0 24 24" class="line-icon"><rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4"/><circle cx="12" cy="3.5" r="1"/><circle cx="9.5" cy="13" r="1.2" fill="currentColor"/><circle cx="14.5" cy="13" r="1.2" fill="currentColor"/><path d="M2.5 12v3M21.5 12v3"/></svg>',
    treat: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5z"/></svg>',
    build: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M4 20V10l8-6 8 6v10z"/><path d="M12 10v6M9 13h6"/></svg>',
    share: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
    cure: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M10 3h4M11 3v6l-5 9a2 2 0 0 0 2 3h8a2 2 0 0 0 2-3l-5-9V3"/><path d="M8 15h8"/></svg>',
    special: '<svg viewBox="0 0 24 24" class="line-icon"><path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>',
    pass: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M5 5l8 7-8 7z"/><path d="M17 5v14"/></svg>',
    station: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M4 20V10l8-6 8 6v10z"/></svg>'
};

function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: Number.isInteger(s.count) && s.count >= MIN_PLAYERS && s.count <= MAX_PLAYERS ? s.count : 2,
            level: Object.hasOwn(LEVELS, s.level) ? s.level : 'intro',
            mode: s.mode === 'team' ? 'team' : 'all'
        };
    } catch {
        return { count: 2, level: 'intro', mode: 'all' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

const cardHtml = (card, extra = '') => {
    if (isEventCard(card)) return `<span class="card ev ${extra}" data-card="${card}"><b>${eventOf(card).name}</b></span>`;
    return `<span class="card c${cardColor(card)} ${CITIES[card].name.length >= 6 ? 'long' : ''} ${extra}" data-card="${card}"><b>${CITIES[card].name}</b></span>`;
};
const cubeHtml = (color, n = 1) => `<span class="cube c${color}"></span>`.repeat(n);
const pawnHtml = (role) => `<span class="pawn" style="--pc:${ROLE[role].color}"></span>`;

// 次に2枚引くとき、伝染が出る見込み（山の分け方から分かる）
export function epidemicOdds(view) {
    const total = view.pileSizes.reduce((a, b) => a + b, 0);
    let drawn = total - view.playerDeckCount;
    let draws = Math.min(2, view.playerDeckCount);
    let chance = 0;
    let i = 0;
    let start = 0;
    while (i < view.pileSizes.length && start + view.pileSizes[i] <= drawn) start += view.pileSizes[i++];
    while (draws > 0 && i < view.pileSizes.length) {
        const rest = view.pileSizes[i] - (drawn - start);
        const take = Math.min(draws, rest);
        if (view.epidemicsDrawn <= i) chance = 1 - (1 - chance) * (1 - take / rest);
        draws -= take;
        drawn += take;
        start += view.pileSizes[i++];
    }
    return chance;
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.focus = null;        // 手札を見せる人
        this.mover = null;        // 動かす駒（通信指令員はほかの駒も選べる）
        this.pick = null;         // 地図で都市を選んでいるとき：{ text, cities, onPick }
        this.sheetKind = null;    // 開いているシートの種類（discard・forecast は段階に合わせて開き直す）
        this.resultShown = false;
        this.newsFrom = 0;
        ['home', 'open-help-game', 'open-log', 'assist'].forEach(id => {
            $(id).innerHTML = ICONS[{ home: 'home', 'open-help-game': 'help', 'open-log': 'log', assist: 'assist' }[id]];
        });
        document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = ICONS[el.dataset.icon]; });
        $('title-art').innerHTML = miniMapSvg();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）。足りない席は CPU
        this.online = new NetplayLobby({
            title: 'パンデミック',
            game: 'pandemic',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: CPU_STEP_DELAY_MS,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [{ key: 'level', label: '難易度', options: [{ value: 'intro', label: '入門' }, { value: 'standard', label: '標準' }, { value: 'heroic', label: '英雄' }] }],
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
        const seg = (id, key, parse = (v) => v) => $(id).addEventListener('click', event => {
            const button = event.target.closest('button');
            if (!button) return;
            this.settings[key] = parse(button.dataset[key]);
            saveSettings(this.settings);
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
        controller.scheduleAuto();
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    beginGame(controller) {
        if (this.controller !== controller) this.controller?.stop();
        this.resultShown = false;
        this.newsFrom = 0;
        this.focus = null;
        this.mover = null;
        this.closeSheet();
        this.setPick(null);
        this.controller = controller;
        $('screen-title').hidden = true;
        $('screen-game').hidden = false;
        this.view = null;
        this.update();
    }

    // ---- ゲーム ----

    bindGame() {
        // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
        $('home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('open-help-game').addEventListener('click', () => this.openHelp());
        $('open-log').addEventListener('click', () => this.openLog());
        $('player-deck').addEventListener('click', () => this.openPlayerDeck());
        $('infection-deck').addEventListener('click', () => this.openInfection());
        $('assist').addEventListener('click', () => this.controller?.assist());
        $('hint').addEventListener('click', () => this.showHint());
        $('pick-cancel').addEventListener('click', () => this.setPick(null));
        $('map').addEventListener('click', event => {
            const g = event.target.closest('[data-city]');
            if (g) this.tapCity(Number(g.dataset.city));
        });
        $('team').addEventListener('click', event => {
            const row = event.target.closest('[data-seat]');
            if (!row) return;
            const seat = Number(row.dataset.seat);
            this.focus = seat;
            const v = this.view;
            if (v && this.isMyActions() && v.players[v.current].role === 'dispatcher') this.mover = seat;
            this.render();
        });
        $('hand').addEventListener('click', event => {
            const el = event.target.closest('[data-card]');
            if (el) this.tapCard(Number(el.dataset.card), el.dataset.stored === '1');
        });
        $('actions').addEventListener('click', event => {
            const button = event.target.closest('[data-act]');
            if (button && !button.disabled) this.doAct(button.dataset.act);
        });
        $('step-btn').addEventListener('click', () => {
            const v = this.view;
            const type = { draw: 'draw', infect: 'infect', epidemic: 'intensify', between: 'continue' }[v.phase];
            if (type) this.send(v.current, { type });
        });
        $('overlay').addEventListener('click', event => {
            if (event.target === $('overlay') && !['discard', 'forecast'].includes(this.sheetKind)) this.closeSheet();
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
        if (ok && !this.view?.result) music.play(COMMAND_SOUND[command.type] ?? 'place');
        return ok;
    }

    // おすすめの手を、短い文で知らせ、行き先の都市・押すボタン・カードを光らせる（打つのは自分）
    showHint() {
        const v = this.view;
        const h = this.controller?.suggest();
        if (!v || !h) {
            this.toast('今はおすすめの手がありません');
            return;
        }
        this.hint = { at: hintKey(v), ...h };
        music.play('select');
        this.toast(`おすすめ：${this.hintText(v, h.seat, h.command)}`);
        this.render();
    }

    hintText(v, seat, c) {
        const city = (id) => CITIES[id].name;
        const name = v.players.length > 1 && seat !== v.current ? `${ROLE[v.players[seat].role].name}：` : '';
        const text = {
            drive: () => `${city(c.to)}へ移動`, direct: () => `直行便で${city(c.card)}へ`, charter: () => `チャーター便で${city(c.to)}へ`,
            shuttle: () => `シャトル便で${city(c.to)}へ`, dispatch: () => `呼び寄せで${city(c.to)}へ`, opsmove: () => `研究所から${city(c.to)}へ`,
            build: () => '研究所を建てる', treat: () => `${COLOR_NAMES[c.color]}を治療する`, give: () => `${cardName(c.card)}を渡す`,
            take: () => `${cardName(c.card)}をもらう`, cure: () => '治療薬を作る', retrieve: () => `${cardName(c.card)}を取り戻す`,
            pass: () => '手番を終える', draw: () => 'カードを引く', infect: () => '感染へ進む', intensify: () => '強化へ進む', continue: () => '先へ進む',
            discard: () => `${cardName(c.card)}を捨てる`, forecast: () => '予測の順で戻す', event: () => `イベント「${eventOf(c.card).name}」を使う`
        }[c.type];
        return name + (text ? text() : c.type);
    }

    // ヒントの印（その手のあいだだけ）
    markHint(v) {
        if (this.hint && this.hint.at !== hintKey(v)) this.hint = null;
        const c = this.hint?.command;
        if (!c) return;
        const mark = (el) => el?.classList.add('suggested');
        if (c.to !== undefined && ['drive', 'charter', 'shuttle', 'dispatch', 'opsmove'].includes(c.type)) mark($('map').querySelector(`[data-city="${c.to}"]`));
        if (c.type === 'direct') mark($('map').querySelector(`[data-city="${c.card}"]`));
        const act = { build: 'build', treat: 'treat', give: 'share', take: 'share', cure: 'cure', pass: 'pass', retrieve: 'special', opsmove: 'special' }[c.type];
        if (act) mark($('actions').querySelector(`[data-act="${act}"]`));
        if (['draw', 'infect', 'intensify', 'continue'].includes(c.type)) mark($('step-btn'));
        if (['discard', 'event'].includes(c.type)) mark($('hand').querySelector(`[data-card="${c.card}"]`));
    }

    can(seat) {
        return !!this.controller?.canControl(seat);
    }

    // 自分が動かせる人のアクションの段階か
    isMyActions() {
        const v = this.view;
        return v && v.phase === 'actions' && this.can(v.current);
    }

    update() {
        if (!this.controller) return;
        const v = this.controller.getView();
        const prev = this.view;
        this.view = v;
        if (!prev || prev.current !== v.current || prev.turnNo !== v.turnNo) {
            this.focus = null;
            this.mover = null;
        }
        if (this.pick && !this.isMyActions() && this.pick.needsActions) this.setPick(null);
        this.render();
        this.playUpdateSound(prev);
        // 割り込み（捨てる・予測）はシートで聞く
        const discarder = v.phase === 'discard' ? v.actors.find(s => this.can(s)) : undefined;
        if (discarder !== undefined) this.openDiscard(discarder);
        else if (v.phase === 'forecast' && this.can(v.forecastBy)) this.openForecast();
        else if (['discard', 'forecast'].includes(this.sheetKind)) this.closeSheet();
        this.recordLocalResult(v);
        if (v.result && !this.resultShown) {
            this.resultShown = true;
            setTimeout(() => this.openResult(), 600);
        }
    }

    // ローカル対戦（人1人と CPU の「CPU に任せる」）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // 協力のゲームなので勝ち・負けのどちらか。「全員を操作」は1台で複数の人が遊ぶので送らない
    // id はシードから作る（同じ対戦を2回数えない）
    recordLocalResult(v) {
        const controller = this.controller;
        if (!v.result || !controller || controller.isOnline || controller.mode !== 'team' || this.recordedController === controller) return;
        this.recordedController = controller;
        recordResult({ game: GAME, id: `${GAME}-${controller.game.options.seed}`, outcome: v.result.won ? 'win' : 'loss' });
    }

    // 1回の更新に1つの音。自分の操作の音は send で鳴らす。CPU の手は知らせ、自分のアクションの番になったらチャイム
    playUpdateSound(prev) {
        const v = this.view;
        if (!prev) return;
        if (v.result) {
            if (!prev.result) music.play(v.result.won ? 'win' : 'lose');
            return;
        }
        if (this.sending) return;
        const wasMine = prev.phase === 'actions' && this.can(prev.current);
        if (this.isMyActions() && !wasMine) music.play('turn');
        else if (this.can(v.current) && v.phase !== 'actions') music.play('draw'); // 自分の番の「引く」「感染」を自動で進めた
        else music.play('notify');
    }

    render() {
        const v = this.view;
        if (!v) return;
        const actor = v.phase === 'discard' ? v.actors[0] : v.phase === 'forecast' ? v.forecastBy : v.current;
        const focus = this.focus ?? (v.phase === 'discard' ? actor : v.current);
        const mover = this.mover ?? v.current;
        // 地図
        let reach = new Set();
        if (this.isMyActions()) {
            const from = v.players[mover].city;
            NEIGHBORS[from].forEach(c => reach.add(c));
            if (v.stations.includes(from)) v.stations.forEach(s => s !== from && reach.add(s));
        }
        $('map').innerHTML = mapSvg(v, { reach, picks: this.pick?.cities ?? null, mover: mover !== v.current ? mover : null });
        // 上の欄
        $('outbreaks').innerHTML = `<span class="mk ob">!</span><b>${v.outbreaks}</b><small>/${MAX_OUTBREAKS}</small>`;
        $('outbreaks').classList.toggle('warn', v.outbreaks >= MAX_OUTBREAKS - 2);
        // 感染率：今の値と、次の伝染のあとの値
        const nextRate = INFECTION_RATES[Math.min(v.rateIndex + 1, INFECTION_RATES.length - 1)];
        $('rate').innerHTML = `<span class="mk">感染率</span><b>${v.rate}</b><small>→${nextRate}</small>`;
        // 治療薬の印：枠だけ＝まだ、塗り＝治療薬、✓＝根絶。中の数は残りの病原体の駒
        $('cures').innerHTML = v.cures.map((c, color) => `<span class="vial c${color} s${c}${v.supply[color] <= 6 && c < 2 ? ' low' : ''}" title="${COLOR_NAMES[color]}：${['未発見', '治療薬', '根絶'][c]}・残り${v.supply[color]}個">${c === 2 ? '✓' : v.supply[color]}</span>`).join('');
        $('player-deck').innerHTML = `<span class="mini-card pc"></span><b>${v.playerDeckCount}</b><small class="epi">${v.epidemicsDrawn}/${v.epidemicsTotal}</small>`;
        $('infection-deck').innerHTML = `<span class="mini-card ic"></span><b>${v.infectionDeckCount}</b>`;
        // 仲間
        $('team').innerHTML = v.players.map(p => {
            const cls = ['tm', p.id === v.current ? 'cur' : '', p.id === focus ? 'focus' : '', p.id === mover && mover !== v.current ? 'mover' : ''].join(' ');
            const colors = [0, 1, 2, 3].map(c => p.hand.filter(x => isCityCard(x) && cardColor(x) === c).length);
            const evs = p.hand.filter(isEventCard).length + (p.stored !== null ? 1 : 0);
            return `<button class="${cls}" data-seat="${p.id}">${pawnHtml(p.role)}<span class="tm-name">${ROLE[p.role].name}</span>`
                + `<span class="tm-cards">${colors.map((n, c) => (n ? `<i class="c${c}">${n}</i>` : '')).join('')}${evs ? `<i class="ev">${evs}</i>` : ''}${p.hand.length ? '' : '<i class="none">0</i>'}</span></button>`;
        }).join('');
        this.showNews(v);
        // 下の欄
        const fp = v.players[focus];
        const owner = v.players.length && fp.name;
        const pips = focus === v.current && v.phase === 'actions'
            ? `<span class="pips">${[0, 1, 2, 3].map(i => `<i class="${i < v.actionsLeft ? 'on' : ''}"></i>`).join('')}</span>` : '';
        const phaseText = this.phaseText(v, focus);
        $('who').innerHTML = `<div class="who-role">${pawnHtml(fp.role)}<b>${ROLE[fp.role].name}</b></div>`
            + `<div class="who-sub">${escapeHtml(owner)}${pips}</div><div class="who-phase">${phaseText}</div>`;
        $('who').title = ROLE[fp.role].text;
        const handCards = fp.hand.map(c => cardHtml(c, isEventCard(c) && this.can(fp.id) ? 'usable' : ''));
        if (fp.stored !== null) handCards.push(cardHtml(fp.stored, `stored ${this.can(fp.id) ? 'usable' : ''}`).replace('data-card', 'data-stored="1" data-card'));
        $('hand').innerHTML = handCards.join('') || '<span class="empty">手札なし</span>';
        $('hand').classList.toggle('over', fp.hand.length > HAND_LIMIT);
        this.renderActions(v);
        this.markHint(v);
    }

    // 新しい出来事を、上の中央に数秒だけ出す（最後の3行）
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

    phaseText(v, seat) {
        if (v.result) return v.result.won ? '勝利' : '敗北';
        if (seat !== v.current && v.phase !== 'discard') return '';
        switch (v.phase) {
            case 'actions': return '';
            case 'draw': return 'カードを引く';
            case 'epidemic': return '伝染：強化の前';
            case 'between': return '2枚目も伝染';
            case 'infect': return v.quiet ? '感染（静かな夜）' : `感染 ${v.rate}都市`;
            case 'discard': return v.actors.includes(seat) ? `手札を${HAND_LIMIT}枚に` : '';
            case 'forecast': return '予測';
        }
        return '';
    }

    renderActions(v) {
        const mine = this.isMyActions();
        const me = v.players[v.current];
        const step = ['draw', 'infect', 'epidemic', 'between'].includes(v.phase) && this.can(v.current) && !v.result;
        $('actions').hidden = step;
        $('step').hidden = !step;
        if (step) {
            $('step-btn').textContent = { draw: 'カードを2枚引く', infect: v.quiet ? '感染をとばす' : `感染（${v.rate}都市）`, epidemic: '強化へ', between: '2枚目の伝染へ' }[v.phase];
        }
        const opts = mine ? this.actionOptions(v) : {};
        $('actions').querySelectorAll('[data-act]').forEach(b => {
            const act = b.dataset.act;
            b.disabled = !mine || (act !== 'pass' && !opts[act]);
            b.classList.toggle('ready', mine && act === 'cure' && !!opts.cure);
        });
        $('assist').hidden = !this.controller || v.result || Boolean(this.controller.isOnline) || !v.actors.some(s => this.can(s)) || (this.controller.mode === 'team' && v.actors.some(s => v.players[s].isCPU));
        $('assist').disabled = false;
        $('hint').hidden = !this.controller || !!v.result || Boolean(this.controller.isOnline); // ヒントはローカル対戦だけ
        void me;
    }

    // 今できるアクション（ボタンを押せるか）
    actionOptions(v) {
        const me = v.players[v.current];
        const city = me.city;
        const others = v.players.filter(p => p.id !== me.id && p.city === city);
        const shareable = others.some(o => me.hand.some(c => isCityCard(c) && (c === city || me.role === 'researcher'))
            || o.hand.some(c => isCityCard(c) && (c === city || o.role === 'researcher')));
        const cureColors = this.cureColors(v);
        let special = false;
        if (me.role === 'ops') special = !v.opsMoveUsed && v.stations.includes(city) && me.hand.some(isCityCard);
        if (me.role === 'planner') special = me.stored === null && v.playerDiscard.some(isEventCard);
        if (me.role === 'dispatcher') special = true;
        return {
            treat: v.cubes[city].some(n => n > 0),
            build: !v.stations.includes(city) && (me.role === 'ops' || me.hand.includes(city)),
            share: shareable,
            cure: v.stations.includes(city) && cureColors.length > 0,
            special
        };
    }

    cureColors(v) {
        const me = v.players[v.current];
        const need = me.role === 'scientist' ? 4 : 5;
        return [0, 1, 2, 3].filter(c => !v.cures[c] && me.hand.filter(x => isCityCard(x) && cardColor(x) === c).length >= need);
    }

    // ---- 地図 ----

    setPick(pick) {
        this.pick = pick;
        $('pick-banner').hidden = !pick;
        if (pick) $('pick-text').textContent = pick.text;
        if (this.view) this.render();
    }

    tapCity(city) {
        const v = this.view;
        if (!v) return;
        if (this.pick) {
            if (!this.pick.cities.has(city)) return;
            const { onPick } = this.pick;
            this.setPick(null);
            onPick(city);
            return;
        }
        if (this.isMyActions()) {
            const mover = this.mover ?? v.current;
            if (NEIGHBORS[v.players[mover].city].includes(city)) {
                this.send(v.current, { type: 'drive', pawn: mover, to: city });
                return;
            }
        }
        this.openCity(city);
    }

    // 都市を押したとき：行き方の一覧と、都市の様子
    openCity(city) {
        const v = this.view;
        const c = CITIES[city];
        const items = [];
        if (this.isMyActions()) {
            const me = v.players[v.current];
            const mover = this.mover ?? v.current;
            const pawn = v.players[mover];
            const from = pawn.city;
            if (from !== city) {
                const path = shortestPath(v, from, city);
                if (path && path.length <= v.actionsLeft) {
                    let at = from;
                    const shuttle = path.some(c => {
                        const hop = !NEIGHBORS[at].includes(c);
                        at = c;
                        return hop;
                    });
                    const via = path.length > 1 ? `${path.slice(0, -1).map(c => CITIES[c].name).join('・')}経由・` : '';
                    items.push({ label: shuttle ? '車・船とシャトル便で行く' : '車・船で行く', sub: `${via}${path.length}アクション`, run: () => this.walk(mover, path) });
                }
                if (me.hand.includes(city)) items.push({ label: '直行便', sub: `${c.name}のカードを使う`, run: () => this.send(me.id, { type: 'direct', pawn: mover, card: city }) });
                if (me.hand.includes(from)) items.push({ label: 'チャーター便', sub: `${CITIES[from].name}のカードを使う`, run: () => this.send(me.id, { type: 'charter', pawn: mover, to: city }) });
                if (me.role === 'dispatcher' && v.players.some(p => p.id !== mover && p.city === city)) {
                    items.push({ label: '呼び寄せ', sub: 'ほかの駒のいる都市へ', run: () => this.send(me.id, { type: 'dispatch', pawn: mover, to: city }) });
                }
                if (me.role === 'ops' && mover === me.id && !v.opsMoveUsed && v.stations.includes(from) && me.hand.some(isCityCard)) {
                    items.push({ label: '研究所から移動', sub: '都市カードを1枚捨てる', run: () => this.chooseOpsCard(city) });
                }
            }
        }
        const cubes = v.cubes[city].map((n, color) => (n ? `${cubeHtml(color, n)}` : '')).join('');
        const pawns = v.players.filter(p => p.city === city).map(p => `${pawnHtml(p.role)}${ROLE[p.role].name}`).join('　');
        const info = `<div class="city-info"><span class="dot c${c.color}"></span>${COLOR_NAMES[c.color]}の都市`
            + `${v.stations.includes(city) ? `<span class="tag">${ICONS.station}研究所</span>` : ''}`
            + `<div class="ci-row">${cubes || '病原体なし'}</div>${pawns ? `<div class="ci-row">${pawns}</div>` : ''}`
            + `<div class="ci-row small">つながり：${NEIGHBORS[city].map(n => CITIES[n].name).join('・')}</div></div>`;
        this.openSheet({ kind: 'city', title: c.name, html: info, items, close: '閉じる' });
    }

    // 行ける道を1歩ずつ送る（隣は車・船、研究所どうしはシャトル便）
    walk(pawn, path) {
        const v = this.view;
        let from = v.players[pawn].city;
        for (const to of path) {
            const type = NEIGHBORS[from].includes(to) ? 'drive' : 'shuttle';
            if (!this.send(v.current, { type, pawn, to })) return;
            from = to;
        }
    }

    chooseOpsCard(to) {
        const v = this.view;
        const me = v.players[v.current];
        const items = me.hand.filter(isCityCard).map(card => ({
            label: cardHtml(card), html: true, run: () => this.send(me.id, { type: 'opsmove', to, card })
        }));
        this.openSheet({ title: `${CITIES[to].name}へ：捨てるカード`, items, close: 'やめる' });
    }

    // ---- 手札 ----

    tapCard(card, stored) {
        const v = this.view;
        const focus = this.focus ?? (v.phase === 'discard' ? v.actors[0] : v.current);
        if (isEventCard(card)) {
            if (this.can(focus)) this.openEvent(focus, card, stored);
            else this.toast(eventOf(card).text);
            return;
        }
        this.openCity(card);
    }

    // ---- アクション ----

    doAct(act) {
        const v = this.view;
        const me = v.players[v.current];
        const city = me.city;
        switch (act) {
            case 'treat': {
                const colors = [0, 1, 2, 3].filter(c => v.cubes[city][c] > 0);
                if (colors.length === 1) this.send(me.id, { type: 'treat', color: colors[0] });
                else this.openSheet({ title: '治療する色', items: colors.map(color => ({ label: `${cubeHtml(color, v.cubes[city][color])} ${COLOR_NAMES[color]}`, html: true, run: () => this.send(me.id, { type: 'treat', color }) })), close: 'やめる' });
                return;
            }
            case 'build':
                if (v.stations.length < MAX_STATIONS) this.send(me.id, { type: 'build' });
                else this.chooseRemove(city, (remove) => this.send(me.id, { type: 'build', remove }));
                return;
            case 'share': return this.openShare();
            case 'cure': return this.openCure();
            case 'special': return this.openSpecial();
            case 'pass': this.send(me.id, { type: 'pass' });
        }
    }

    chooseRemove(city, done) {
        const v = this.view;
        this.openSheet({
            title: '研究所は6つまで：移すもの',
            items: v.stations.filter(s => s !== city).map(s => ({ label: CITIES[s].name, run: () => done(s) })),
            close: 'やめる'
        });
    }

    openShare() {
        const v = this.view;
        const me = v.players[v.current];
        const items = [];
        v.players.filter(o => o.id !== me.id && o.city === me.city).forEach(o => {
            me.hand.filter(c => isCityCard(c) && (c === me.city || me.role === 'researcher')).forEach(card => items.push({
                label: `${cardHtml(card)} を${ROLE[o.role].name}に渡す`, html: true, run: () => this.send(me.id, { type: 'give', to: o.id, card })
            }));
            o.hand.filter(c => isCityCard(c) && (c === me.city || o.role === 'researcher')).forEach(card => items.push({
                label: `${cardHtml(card)} を${ROLE[o.role].name}からもらう`, html: true, run: () => this.send(me.id, { type: 'take', from: o.id, card })
            }));
        });
        this.openSheet({ title: '知識の共有', items, close: 'やめる' });
    }

    openCure() {
        const v = this.view;
        const me = v.players[v.current];
        const need = me.role === 'scientist' ? 4 : 5;
        const colors = this.cureColors(v);
        if (colors.length === 1) {
            const cards = me.hand.filter(x => isCityCard(x) && cardColor(x) === colors[0]);
            if (cards.length === need) {
                this.send(me.id, { type: 'cure', cards });
                return;
            }
        }
        // 多いときは、使うカードを選ぶ
        const color = colors[0];
        const cards = me.hand.filter(x => isCityCard(x) && cardColor(x) === color);
        const chosen = new Set(cards.slice(0, need));
        const draw = () => {
            this.openSheet({
                kind: 'cure',
                title: `${COLOR_NAMES[color]}の治療薬：${need}枚を選ぶ`,
                items: [
                    ...cards.map(card => ({ label: cardHtml(card, chosen.has(card) ? 'chosen' : 'dim'), html: true, keep: true, run: () => {
                        if (chosen.has(card)) chosen.delete(card);
                        else chosen.add(card);
                        draw();
                    } })),
                    { label: '発見する', primary: true, disabled: chosen.size !== need, run: () => this.send(me.id, { type: 'cure', cards: [...chosen] }) }
                ],
                close: 'やめる'
            });
        };
        draw();
    }

    openSpecial() {
        const v = this.view;
        const me = v.players[v.current];
        const role = ROLE[me.role];
        if (me.role === 'ops') {
            this.setPick({ text: '研究所から移動：行き先を選ぶ', cities: new Set(CITIES.map(c => c.id).filter(c => c !== me.city)), needsActions: true, onPick: (to) => this.chooseOpsCard(to) });
            return;
        }
        if (me.role === 'planner') {
            this.openSheet({
                title: 'イベントを拾う',
                html: `<p class="sheet-text">${role.text}</p>`,
                items: v.playerDiscard.filter(isEventCard).map(card => ({ label: `${cardHtml(card)} ${eventOf(card).text}`, html: true, run: () => this.send(me.id, { type: 'retrieve', card }) })),
                close: 'やめる'
            });
            return;
        }
        if (me.role === 'dispatcher') {
            this.openSheet({
                title: '動かす駒',
                html: `<p class="sheet-text">${role.text}</p>`,
                items: v.players.map(p => ({ label: `${pawnHtml(p.role)}${ROLE[p.role].name}（${CITIES[p.city].name}）`, html: true, run: () => { this.mover = p.id; this.focus = p.id; this.render(); } })),
                close: '閉じる'
            });
        }
    }

    // ---- イベント ----

    openEvent(seat, card, stored) {
        const v = this.view;
        const ev = eventOf(card);
        const p = v.players[seat];
        const base = { type: 'event', card, stored };
        const go = (extra = {}) => this.send(seat, { ...base, ...extra });
        const items = [];
        switch (ev.key) {
            case 'airlift':
                v.players.forEach(q => items.push({
                    label: `${pawnHtml(q.role)}${ROLE[q.role].name}を動かす`, html: true,
                    run: () => this.setPick({ text: `空輸：${ROLE[q.role].name}の行き先`, cities: new Set(CITIES.map(c => c.id).filter(c => c !== q.city)), onPick: (to) => go({ pawn: q.id, to }) })
                }));
                break;
            case 'grant':
                items.push({
                    label: '地図で都市を選ぶ', primary: true,
                    run: () => this.setPick({
                        text: '政府の助成金：研究所を建てる都市', cities: new Set(CITIES.map(c => c.id).filter(c => !v.stations.includes(c))),
                        onPick: (city) => (v.stations.length < MAX_STATIONS ? go({ city }) : this.chooseRemove(city, (remove) => go({ city, remove })))
                    })
                });
                break;
            case 'resilient':
                v.infectionDiscard.forEach(city => items.push({ label: `<span class="dot c${CITIES[city].color}"></span>${CITIES[city].name}`, html: true, run: () => go({ city }) }));
                break;
            default:
                items.push({ label: '使う', primary: true, run: () => go() });
        }
        this.openSheet({
            title: ev.name,
            html: `<p class="sheet-text">${ev.text}${stored ? '（使うとゲームから取り除く）' : ''}</p><p class="sheet-sub">${ROLE[p.role].name}のカード</p>`,
            items,
            close: 'やめる'
        });
    }

    openDiscard(seat) {
        const v = this.view;
        const p = v.players[seat];
        const items = p.hand.map(card => ({
            label: isEventCard(card) ? `${cardHtml(card)} 使う` : `${cardHtml(card)} 捨てる`, html: true,
            run: () => (isEventCard(card) ? this.openEvent(seat, card, false) : this.send(seat, { type: 'discard', card }))
        }));
        this.openSheet({ kind: 'discard', title: `${ROLE[p.role].name}：手札が${p.hand.length}枚`, html: `<p class="sheet-text">${HAND_LIMIT}枚になるまで捨てる（イベントは使ってもよい）</p>`, items, grid: true });
    }

    openForecast() {
        const v = this.view;
        const order = [];
        const draw = () => {
            const items = v.forecast.map((city, i) => {
                const k = order.indexOf(i);
                const color = CITIES[city].color;
                return {
                    label: `${k >= 0 ? `<b class="ord">${k + 1}</b>` : '<b class="ord off">・</b>'}<span class="dot c${color}"></span>${CITIES[city].name} ${cubeHtml(color, v.cubes[city][color])}`,
                    html: true, keep: true,
                    run: () => {
                        if (k >= 0) order.splice(k, 1);
                        else order.push(i);
                        draw();
                    }
                };
            });
            items.push({ label: 'この順で戻す', primary: true, disabled: order.length !== v.forecast.length, run: () => this.send(v.forecastBy, { type: 'forecast', order: [...order] }) });
            this.openSheet({ kind: 'forecast', title: '予測：上から出る順に選ぶ', items });
        };
        draw();
    }

    // ---- 情報 ----

    openInfection() {
        const v = this.view;
        const byColor = (list) => [0, 1, 2, 3].map(color => list.filter(c => CITIES[c].color === color)
            .map(c => `<span class="chip"><span class="dot c${color}"></span>${CITIES[c].name}${v.cubes[c][color] ? cubeHtml(color, v.cubes[c][color]) : ''}</span>`).join('')).join('');
        // 順の分かる1枚ずつのまとまり（予測で並べたもの）は、出る順に1行で見せる
        const order = [];
        let k = 0;
        while (k < v.known.length && v.known[k].length === 1) order.push(v.known[k++][0]);
        const chip = (c) => `<span class="chip"><span class="dot c${CITIES[c].color}"></span>${CITIES[c].name}${v.cubes[c][CITIES[c].color] ? cubeHtml(CITIES[c].color, v.cubes[c][CITIES[c].color]) : ''}</span>`;
        const known = v.known.length
            ? (order.length ? `<div class="seg"><small>次に出る順</small>${order.map((c, i) => `<b class="ord">${i + 1}</b>${chip(c)}`).join('')}</div>` : '')
              + v.known.slice(k).map((seg, i) => `<div class="seg"><small>${i === 0 && !order.length ? '次に出る' : 'その下'}（${seg.length}枚。順は分からない）</small>${byColor(seg)}</div>`).join('')
            : '<p class="sheet-sub">伝染のあと、捨て札が山の上に戻ります</p>';
        const html = `<p class="sheet-text">感染率 ${v.rate}・山 ${v.infectionDeckCount}枚${v.quiet ? '・次の感染はとばす' : ''}</p>`
            + `<h3>山の上にある都市</h3>${known}`
            + `<h3>捨て札（${v.infectionDiscard.length}枚）</h3><div class="chips">${byColor(v.infectionDiscard) || 'なし'}</div>`
            + (v.infectionRemoved.length ? `<h3>取り除いた</h3><div class="chips">${byColor(v.infectionRemoved)}</div>` : '');
        this.openSheet({ title: '感染カード', html, close: '閉じる' });
    }

    openPlayerDeck() {
        const v = this.view;
        const odds = Math.round(epidemicOdds(v) * 100);
        const events = v.playerDiscard.filter(isEventCard);
        const html = `<p class="sheet-text">山 ${v.playerDeckCount}枚（2枚ずつで、あと${Math.floor(v.playerDeckCount / 2)}手番）</p>`
            + `<p class="sheet-text">伝染 ${v.epidemicsDrawn}/${v.epidemicsTotal}・次に引く2枚に伝染が出る見込み ${odds}%</p>`
            + `<h3>捨て札（${v.playerDiscard.length}枚）</h3><div class="chips">${v.playerDiscard.map(c => cardHtml(c)).join('') || 'なし'}</div>`
            + (events.length ? '' : '');
        this.openSheet({ title: 'プレイヤーカード', html, close: '閉じる' });
    }

    openLog() {
        const v = this.view;
        const html = `<div class="log">${v.logs.slice().reverse().map(l => `<div class="${l.head ? 'head' : ''}">${escapeHtml(l.text)}</div>`).join('')}</div>`;
        this.openSheet({ title: '記録', html, close: '閉じる' });
    }

    openHelp() {
        this.openSheet({ title: '遊び方', html: HELP_HTML, close: '閉じる', wide: true });
    }

    openResult() {
        const v = this.view;
        if (!v?.result) return;
        const reasons = { won: '4色の治療薬がそろいました', outbreaks: 'アウトブレイクが8回に達しました', cubes: '病原体の駒が足りなくなりました', deck: 'プレイヤーカードが尽きました' };
        this.openSheet({
            kind: 'result',
            title: v.result.won ? '勝利' : '敗北',
            html: `<p class="sheet-text">${reasons[v.result.reason]}</p><p class="sheet-sub">${LEVELS[v.level].name}・${v.players.length}人・${v.turnNo}手番目・治療薬 ${v.cures.filter(Boolean).length}色</p>`,
            items: [
                // オンラインは、ロビーを出し、ホストの「もう一度」で再戦する
                { label: 'もう一度', primary: true, run: () => (this.controller?.isOnline ? this.online.rematch() : this.start()) },
                { label: 'ホーム', center: true, run: () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()) }
            ]
        });
    }

    // ---- シート ----

    // items: [{ label, sub, html, run, primary, disabled, keep }]。keep は押しても閉じない
    openSheet({ kind = 'info', title, html = '', items = [], close = null, grid = false, wide = false }) {
        this.sheetKind = kind;
        $('sheet-title').textContent = title;
        const list = items.map((it, i) => `<button class="opt${it.primary ? ' primary' : ''}${it.center ? ' center' : ''}" data-i="${i}" ${it.disabled ? 'disabled' : ''}>`
            + `<span class="opt-label">${it.html ? it.label : escapeHtml(it.label)}</span>${it.sub ? `<small>${escapeHtml(it.sub)}</small>` : ''}</button>`).join('');
        $('sheet-body').innerHTML = html + (items.length ? `<div class="opts${grid ? ' grid' : ''}">${list}</div>` : '');
        this.sheetHandlers = items.map(it => () => {
            if (!it.keep) this.closeSheet();
            it.run();
        });
        $('sheet-buttons').innerHTML = close ? `<button class="btn secondary" data-i="${items.length}">${close}</button>` : '';
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
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}

export { EVENTS, DISEASE_COLORS };
