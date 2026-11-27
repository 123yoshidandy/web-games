/**
 * 画面（タイトル・ゲーム・説明・選択・結果・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 */

import { CARDS, RESOURCES, RESOURCE_NAMES, TYPES, BASIC_LOCATIONS, FOREST_LOCATIONS, BASIC_EVENTS, SPECIAL_EVENTS, JOURNEY_SPOTS } from './cards.js';
import { MIN_PLAYERS, MAX_PLAYERS, SEASON_NAMES, CITY_LIMIT, HAND_LIMIT } from './game.js';
import { LEVELS, suggest } from './cpu-player.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { getServerUrl } from './online-config.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { symbolsSvg, icon, workerIcon, resHtml, costHtml, cardHtml, cardDetailHtml, typeChip, PLAYER_COLORS } from './art.js';

const GAME = 'everdell';
const SETTINGS_KEY = 'everdell.settings';
const CPU_NAMES = ['リス', 'カエル', 'ネズミ'];
const RESULT_DELAY_MS = 900;
const FRESH_MS = 1600;
// 自分の操作の効果音
const COMMAND_SOUNDS = { place: 'place', play: 'place', prepare: 'gain', pass: 'notify', answer: 'select' };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// 文で説明する場所の短い名前
const PLACE_TITLES = {
    'f-copy': '基本をまねる', 'f-trade': '捨てて資源', 'f-redraw': '捨てて引き直し', 'f-meadow': '草原から2枚',
    haven: '港'
};

function loadSettings() {
    const fallback = { cpus: 2, level: 'normal' };
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            cpus: Number.isInteger(saved.cpus) && saved.cpus >= MIN_PLAYERS - 1 && saved.cpus <= MAX_PLAYERS - 1 ? saved.cpus : fallback.cpus,
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

// 場所の得られるもの（図柄）
function gainHtml(def) {
    const parts = Object.entries(def.gain ?? {}).map(([r, n]) => `<span class="res">${icon(r)}<b>${n}</b></span>`);
    if (def.any) parts.push(`<span class="res any">好きな資源<b>${def.any}</b></span>`);
    if (def.cards) parts.push(`<span class="res">${icon('card')}<b>${def.cards}</b></span>`);
    if (def.points) parts.push(`<span class="res">${icon('point')}<b>${def.points}</b></span>`);
    return parts.join('');
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.tab = 'meadow';
        this.lastSeq = 0;
        this.fresh = new Map();
        this.dismissedPrompt = null;
        this.selected = new Set();
        this.resultTimer = null;
        this.detailTarget = null;
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'エバーデール',
            game: 'everdell',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 800,
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
        $('#symbols').innerHTML = symbolsSvg();
        this.bindStatic();
        this.renderTitleArt();
        this.renderHelpPictures();
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
        this.resultShown = false;
        this.view = this.controller.getView();
        this.lastSeq = this.view.events.at(-1)?.seq ?? 0;
        this.dismissedPrompt = null;
        this.tab = 'meadow';
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        if (!this.controller.isOnline) this.controller.scheduleCpu();
    }

    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    goHome() {
        if (this.controller?.isOnline) return this.online.confirmLeave();
        this.showTitle();
    }

    newGame() {
        const { cpus, level } = this.settings;
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.slice(0, cpus).map(name => ({ name, isCPU: true }))];
        this.startGame({ players, options: {}, level });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#count-down').addEventListener('click', () => this.changeSetting({ cpus: this.settings.cpus - 1 }));
        $('#count-up').addEventListener('click', () => this.changeSetting({ cpus: this.settings.cpus + 1 }));
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
        $('#result-board').addEventListener('click', () => $('#result').close());
        $('#home').addEventListener('click', () => this.goHome());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#open-log').addEventListener('click', () => this.showLog());
        $('#hint').addEventListener('click', () => this.showHint());

        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            if (dialog.id === 'result' || dialog.id === 'prompt') {
                dialog.addEventListener('cancel', event => {
                    event.preventDefault();
                    if (dialog.id === 'prompt') this.dismissPrompt();
                });
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        document.querySelector('.tabs').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-tab]');
            if (!button) return;
            this.tab = button.dataset.tab;
            this.render();
        });

        // カード・場所をタップしたら説明と操作を出す
        const onPick = (event) => {
            const el = event.target.closest('[data-src],[data-loc],[data-seat]');
            if (!el || !this.view) return;
            music.play('select');
            if (el.dataset.src) this.openCard(el.dataset.src, Number(el.dataset.index), el.dataset.uid ? Number(el.dataset.uid) : null);
            else if (el.dataset.loc) this.openPlace(el.dataset.loc);
            else if (el.dataset.seat) this.openCity(Number(el.dataset.seat));
        };
        ['#panel', '#hand', '#opponents', '#city-body'].forEach(sel => $(sel).addEventListener('click', onPick));

        $('#detail-actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-cmd]');
            if (!button || button.disabled) return;
            const command = JSON.parse(button.dataset.cmd);
            $('#detail').close();
            $('#city').close();
            this.send(command);
        });

        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            const act = button.dataset.act;
            if (act === 'reopen') {
                this.dismissedPrompt = null;
                this.openPrompt();
            } else if (act === 'prepare') {
                this.send({ type: 'prepare' });
            } else if (act === 'pass') {
                this.confirmPass();
            }
        });

        $('#prompt-options').addEventListener('click', (event) => this.onPromptOption(event));
        $('#prompt-ok').addEventListener('click', () => this.sendPrompt([...this.selected]));
        $('#prompt-look').addEventListener('click', () => this.dismissPrompt());

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    changeSetting(change) {
        const next = { ...this.settings, ...change };
        next.cpus = Math.min(MAX_PLAYERS - 1, Math.max(MIN_PLAYERS - 1, next.cpus));
        this.settings = next;
        saveSettings(next);
        this.renderSetup();
    }

    renderSetup() {
        $('#count-value').textContent = `${this.settings.cpus}人`;
        $('#count-down').disabled = this.settings.cpus <= MIN_PLAYERS - 1;
        $('#count-up').disabled = this.settings.cpus >= MAX_PLAYERS - 1;
        $('#level').innerHTML = Object.entries(LEVELS).map(([key, label]) =>
            `<button data-level="${key}" role="radio" aria-checked="${key === this.settings.level}" class="${key === this.settings.level ? 'on' : ''}">${label}</button>`).join('');
    }

    renderTitleArt() {
        $('#title-art').innerHTML = ['farm', 'husband', 'everTree', 'wife', 'inn']
            .map((id, i) => cardHtml(id, { cls: `fan fan-${i}` })).join('');
    }

    renderHelpPictures() {
        $('#help-res').innerHTML = `<div class="help-res">${RESOURCES.map(r => `<span class="res">${icon(r)}${RESOURCE_NAMES[r]}</span>`).join('')}
            <span class="res">${icon('point')}点</span><span class="res">${icon('card')}カード</span></div>`;
        $('#help-types').innerHTML = `<div class="help-types">${Object.keys(TYPES).map(t => typeChip(t)).join('')}</div>`;
    }

    // ---- 更新 ----

    // 自分の操作を送る。送っている間の更新は、自分の操作の結果として音を鳴らす
    send(command) {
        if (!this.controller) return false;
        this.sending = command;
        try {
            return this.controller.send(command);
        } finally {
            this.sending = null;
        }
    }

    onUpdate() {
        if (!this.controller) return;
        const before = { phase: this.view?.phase, myTurn: this.myTurn(), prompt: this.view?.prompt?.id };
        this.view = this.controller.getView();
        const freshEvents = this.view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = this.view.events.at(-1)?.seq ?? this.lastSeq;
        const now = Date.now();
        freshEvents.forEach(e => {
            if (e.type === 'play') this.fresh.set(`c${e.uid}`, now);
            if (e.type === 'place') this.fresh.set(`l${e.loc}`, now);
            if (e.seat !== undefined) this.fresh.set(`s${e.seat}`, now);
        });
        this.playSound(before, freshEvents);
        this.render();
        clearTimeout(this.freshTimer);
        this.freshTimer = setTimeout(() => this.clearFresh(), FRESH_MS);
    }

    // 1つの更新に1つの音。相手の手は notify、自分の番になったら turn
    playSound(before, freshEvents) {
        const v = this.view;
        if (v.phase === 'end') {
            if (before.phase !== 'end') music.play(v.winners.includes(v.you) ? 'win' : 'lose');
        } else if (this.sending) {
            music.play(COMMAND_SOUNDS[this.sending.type] ?? 'place');
        } else if (this.myTurn() && !before.myTurn) {
            music.play('turn');
        } else if ((v.prompt && !v.prompt.waiting && v.prompt.id !== before.prompt) || freshEvents.some(e => e.seat !== v.you)) {
            music.play('notify');
        }
    }

    // ---- ヒント ----

    showHint() {
        if (!this.myTurn() || this.controller?.isOnline) return;
        const command = suggest(this.controller.game, this.view.you);
        if (!command) return;
        music.play('select');
        this.hint = { at: this.controller.game.commands.length, command };
        if (command.type === 'place') this.tab = [...BASIC_EVENTS, ...SPECIAL_EVENTS].some(e => e.id === command.loc) ? 'events' : 'places';
        else if (command.type === 'play' && command.source === 'meadow') this.tab = 'meadow';
        this.render();
        this.toast(`おすすめ：${this.describeHint(command)}`);
    }

    describeHint(command) {
        const me = this.me();
        if (command.type === 'play') {
            const id = command.source === 'hand' ? me.hand[command.index] : this.view.meadow[command.index];
            return `${command.source === 'hand' ? '手札' : '草原'}の「${CARDS[id]?.name ?? ''}」を出す`;
        }
        if (command.type === 'place') return '光っている場所にワーカーを置く';
        if (command.type === 'prepare') return `${SEASON_NAMES[me.season + 1]}の準備`;
        return '終える';
    }

    // おすすめの手の要素に .recommended を付ける。盤面が進んだら消す
    markHint() {
        document.querySelectorAll('.recommended').forEach(el => el.classList.remove('recommended'));
        $('#hint').hidden = Boolean(this.controller?.isOnline); // ヒントはローカル対戦だけ
        $('#hint').disabled = !this.myTurn();
        const hint = this.hint;
        if (!hint || this.controller?.isOnline || hint.at !== this.controller?.game.commands.length || !this.myTurn()) {
            this.hint = null;
            return;
        }
        const c = hint.command;
        const selector = c.type === 'place' ? `[data-loc="${c.loc}"]`
            : c.type === 'play' ? `[data-src="${c.source}"][data-index="${c.index}"]`
                : `#actions [data-act="${c.type}"]`;
        document.querySelectorAll(selector).forEach(el => el.classList.add('recommended'));
    }

    clearFresh() {
        const now = Date.now();
        [...this.fresh].forEach(([key, at]) => { if (now - at >= FRESH_MS - 50) this.fresh.delete(key); });
        document.querySelectorAll('.fresh').forEach(el => el.classList.remove('fresh'));
    }

    isFresh(key) {
        return this.fresh.has(key) ? 'fresh' : '';
    }

    myTurn() {
        const v = this.view;
        return !!v && v.phase === 'play' && !v.prompt && v.turn === v.you;
    }

    me() {
        return this.view.players[this.view.you];
    }

    render() {
        if (!this.view) return;
        this.renderStatus();
        this.renderOpponents();
        this.renderTabs();
        this.renderPanel();
        this.renderTicker();
        this.renderMybar();
        this.renderHand();
        this.renderActions();
        this.syncPrompt();
        this.refreshOpenSheets();
        this.markHint();
        if (this.view.phase === 'end' && !$('#result').open && !this.resultShown) {
            clearTimeout(this.resultTimer);
            this.resultTimer = setTimeout(() => this.showResult(), RESULT_DELAY_MS);
        }
        if (this.view.phase !== 'end') this.resultShown = false;
    }

    renderStatus() {
        const v = this.view;
        const me = this.me();
        let text;
        if (v.phase === 'end') text = '終わりました';
        else if (v.prompt && !v.prompt.waiting) text = '効果を選んでください';
        else if (this.myTurn()) text = 'あなたの番';
        else text = `${escapeHtml(v.players[v.actor ?? v.turn].name)}の番`;
        $('#status').innerHTML = `<span class="season s${me.season}">${SEASON_NAMES[me.season]}</span><span class="status-text">${text}</span>
            <span class="deck">${icon('card')}${v.deckCount}</span>`;
    }

    renderOpponents() {
        const v = this.view;
        $('#opponents').classList.toggle('many', v.players.length >= 4);
        $('#opponents').innerHTML = v.players.filter(p => p.id !== v.you).map(p => {
            const active = v.phase === 'play' && v.actor === p.id;
            return `<button class="opp ${active ? 'active' : ''} ${p.passed ? 'passed' : ''} ${this.isFresh(`s${p.id}`)}" data-seat="${p.id}" type="button"
                style="--pc:${PLAYER_COLORS[p.id]}">
                <span class="opp-head"><span class="opp-name">${escapeHtml(p.name)}</span>
                    ${active ? '<span class="thinking" aria-label="考えています"><i></i><i></i><i></i></span>' : ''}
                    <span class="opp-score">${p.score.total}<small>点</small></span></span>
                <span class="opp-info"><span class="season mini s${p.season}">${p.passed ? '終' : SEASON_NAMES[p.season]}</span>
                    <span>${workerIcon(p.id)}${p.available}<i class="wk-total">/${p.workers}</i></span><span>${icon('card')}${p.handCount}</span><span class="opp-city">街${p.slots}</span></span>
            </button>`;
        }).join('');
    }

    renderTabs() {
        const me = this.me();
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.toggle('on', tab.dataset.tab === this.tab);
            tab.setAttribute('aria-selected', tab.dataset.tab === this.tab);
            if (tab.dataset.tab === 'city') tab.innerHTML = `街 <small>${me.slots}/${CITY_LIMIT}</small>`;
        });
    }

    playable(source, index) {
        return this.view.plays.some(o => o.source === source && o.index === index);
    }

    renderPanel() {
        const panel = $('#panel');
        const top = panel.scrollTop;
        const html = { meadow: () => this.meadowHtml(), places: () => this.placesHtml(), events: () => this.eventsHtml(), city: () => this.cityHtml(this.me()) }[this.tab]();
        if (panel.dataset.tab !== this.tab) panel.scrollTop = 0;
        panel.innerHTML = html;
        if (panel.dataset.tab === this.tab) panel.scrollTop = top;
        panel.dataset.tab = this.tab;
    }

    meadowHtml() {
        const v = this.view;
        return `<div class="grid4 meadow">${v.meadow.map((id, i) => id
            ? cardHtml(id, { data: { src: 'meadow', index: i }, cls: this.playable('meadow', i) ? 'can' : '' })
            : '<span class="card empty"></span>').join('')}</div>`;
    }

    workersHtml(loc) {
        return (this.view.occupancy[loc] ?? []).map(seat => workerIcon(seat)).join('');
    }

    placeTile(loc, title, body, { dots = '' } = {}) {
        const reason = this.view.reasons[loc];
        const can = reason === null;
        return `<button class="place ${can ? 'can' : ''} ${this.isFresh(`l${loc}`)}" data-loc="${loc}" type="button">
            <span class="pl-title">${title}${dots}</span><span class="pl-body">${body}</span>
            <span class="pl-workers">${this.workersHtml(loc)}</span></button>`;
    }

    placesHtml() {
        const v = this.view;
        const me = this.me();
        const basics = BASIC_LOCATIONS.map(l => this.placeTile(l.id, gainHtml(l), '', { dots: l.exclusive ? '<i class="solo" title="1人だけ"></i>' : '' })).join('');
        const forest = v.forest.map(id => {
            const def = FOREST_LOCATIONS.find(l => l.id === id);
            return def.text ? this.placeTile(id, PLACE_TITLES[id], `<small>${def.text}</small>`) : this.placeTile(id, gainHtml(def), '');
        }).join('');
        const journey = JOURNEY_SPOTS.map(n => this.placeTile(`journey-${n}`, `旅 ${icon('point')}${n}`,
            `<small>秋だけ・${n}枚捨てる</small>`, { dots: n !== 2 ? '<i class="solo" title="1人だけ"></i>' : '' })).join('');
        const dests = v.players.flatMap(p => p.city.filter(c => CARDS[c.id].spot && (p.id === v.you || CARDS[c.id].open))
            .map(c => this.destTile(p, c)));
        return `<h3 class="sec">基本の場所</h3><div class="grid2">${basics}</div>
            <h3 class="sec">森</h3><div class="grid2">${forest}</div>
            <h3 class="sec">港と旅</h3><div class="grid2">${this.placeTile('haven', '港', '<small>2枚捨てるごとに好きな資源1つ</small>')}${journey}</div>
            <h3 class="sec">目的地のカード</h3>${dests.length ? `<div class="grid2">${dests.join('')}</div>` : `<p class="muted note">赤の目的地のカードを出すと、ここにワーカーを置けます。${me.id === v.you ? '' : ''}</p>`}`;
    }

    destTile(owner, c) {
        const loc = `card-${c.uid}`;
        const mine = owner.id === this.view.you;
        const extra = c.id === 'storehouse' ? `<span class="pl-store">${resHtml(c.res)}</span>` : c.id === 'chapel' && c.tokens ? `${icon('point')}${c.tokens}` : '';
        return `<button class="place dest ${this.view.reasons[loc] === null ? 'can' : ''} ${this.isFresh(`l${loc}`)}" data-loc="${loc}" type="button">
            <span class="pl-title">${CARDS[c.id].name}${extra}</span><span class="pl-body"><small>${mine ? '自分の街' : `${escapeHtml(owner.name)}の街`}</small></span>
            <span class="pl-workers">${this.workersHtml(loc)}</span></button>`;
    }

    eventsHtml() {
        const v = this.view;
        const tile = (id, title, body) => {
            const owner = v.claimed[id];
            const done = owner !== undefined ? `<span class="ev-done" style="--pc:${PLAYER_COLORS[owner]}">${escapeHtml(v.players[owner].name)}</span>` : '';
            return `<button class="place event ${v.reasons[id] === null ? 'can' : ''} ${owner !== undefined ? 'claimed' : ''}" data-loc="${id}" type="button">
                <span class="pl-title">${title}</span><span class="pl-body">${body}</span>${done}</button>`;
        };
        const basics = BASIC_EVENTS.map(e => tile(e.id, `${typeChip(e.type)} ${e.need}枚`, `<small>${icon('point')}3点</small>`)).join('');
        const specials = v.specials.map(id => {
            const e = SPECIAL_EVENTS.find(x => x.id === id);
            const needs = e.needsTypes ? '5色を2枚ずつ' : e.needs.map(n => CARDS[n].name).join('＋');
            return tile(id, e.name, `<small>${needs}</small>`);
        }).join('');
        return `<h3 class="sec">基本の行事</h3><div class="grid2">${basics}</div><h3 class="sec">特別な行事</h3><div class="grid2">${specials}</div>`;
    }

    cityHtml(p) {
        if (p.city.length === 0) return '<p class="muted note">まだカードがありません</p>';
        // 夫と妻の組は並べて置く
        const order = [];
        p.city.forEach(c => {
            if (order.includes(c)) return;
            order.push(c);
            if (c.paired) {
                const partner = p.city.find(x => x.uid === c.paired);
                if (partner && !order.includes(partner)) order.push(partner);
            }
        });
        return `<div class="grid4 city">${order.map(c => {
            const loc = `card-${c.uid}`;
            const marks = [
                c.occupied ? '<span class="mark occ" title="無料で出すのに使った">済</span>' : '',
                c.paired ? '<span class="mark pair" title="夫と妻の組">組</span>' : '',
                c.tokens ? `<span class="mark tok">${icon('point')}${c.tokens}</span>` : '',
                c.under?.length ? `<span class="mark tok">牢${c.under.length}</span>` : '',
                this.workersHtml(loc)
            ].join('');
            const store = c.res && Object.values(c.res).some(n => n > 0) ? `<span class="c-cost">${resHtml(c.res)}</span>` : '<span></span>';
            return cardHtml(c.id, {
                data: { src: 'city', index: p.id, uid: c.uid },
                cls: `${this.view.reasons[loc] === null ? 'can' : ''} ${this.isFresh(`c${c.uid}`)}`,
                foot: store, badge: `<span class="marks">${marks}</span>`
            });
        }).join('')}</div>`;
    }

    renderTicker() {
        const v = this.view;
        $('#ticker').textContent = v.logs.at(-1) ?? '';
    }

    renderMybar() {
        const me = this.me();
        $('#mybar').innerHTML = `<span class="my-res">${resHtml(me.res, { zero: true })}</span>
            <span class="my-workers">${workerIcon(me.id)}<b>${me.available}</b>/${me.workers}</span>
            <span class="my-score">${icon('point')}<b>${me.score.total}</b></span>`;
    }

    renderHand() {
        const me = this.me();
        $('#hand').innerHTML = `<div class="hand-head">手札 ${me.hand.length}/${HAND_LIMIT}</div><div class="grid4 hand-cards">${me.hand.map((id, i) =>
            cardHtml(id, { data: { src: 'hand', index: i }, cls: this.playable('hand', i) ? 'can' : '' })).join('')}</div>`;
    }

    renderActions() {
        const v = this.view;
        let html = '';
        if (v.phase === 'end') {
            html = '<button class="btn secondary" data-act="result">結果を見る</button>';
        } else if (v.prompt && !v.prompt.waiting) {
            html = '<span class="act-label">効果の選択の途中です</span><button class="btn primary" data-act="reopen">選択に戻る</button>';
        } else if (this.myTurn()) {
            const me = this.me();
            const hint = me.available > 0 ? 'ワーカーを置くか、カードを出す' : me.season < 3 ? 'カードを出すか、季節の準備' : 'カードを出すか、終える';
            html = `<span class="act-label">${hint}</span>`;
            if (v.canPrepare) html += `<button class="btn primary" data-act="prepare">${SEASON_NAMES[me.season + 1]}の準備</button>`;
            if (v.canPass) html += `<button class="btn ${me.available === 0 ? 'primary' : 'secondary'}" data-act="pass">終える</button>`;
        } else {
            html = `<span class="act-label muted">${escapeHtml(v.players[v.actor ?? v.turn].name)}が考えています</span>`;
        }
        $('#actions').innerHTML = html;
        $('#actions').querySelector('[data-act="result"]')?.addEventListener('click', () => this.showResult());
    }

    confirmPass() {
        const me = this.me();
        const warn = me.available > 0 ? `まだワーカーが${me.available}人います。` : '';
        this.detailTarget = { kind: 'pass' };
        $('#detail-body').innerHTML = `<h2>終えますか</h2><p>${warn}終えると、このゲームではもう何もできません。</p>`;
        $('#detail-actions').innerHTML = `<button class="btn primary" data-cmd='${JSON.stringify({ type: 'pass' })}'>終える</button>`;
        $('#detail').showModal();
    }

    // ---- 説明と操作のシート ----

    methodLabel(o) {
        const v = this.view;
        const cost = `<span class="cost-in">${costHtml(o.cost)}</span>`;
        const to = o.target !== undefined ? ` → ${escapeHtml(v.players[o.target].name)}の街` : '';
        const me = this.me();
        switch (o.method) {
            case 'pay': return `出す${cost}${to}`;
            case 'occupy': {
                const host = me.city.find(c => c.uid === o.host);
                return `${CARDS[host.id].name}で無料で出す${to}`;
            }
            case 'crane': return `クレーンを捨てて出す${cost}`;
            case 'innkeeper': return `宿の主人を捨てて出す${cost}${to}`;
            case 'dungeon': {
                const prisoner = me.city.find(c => c.uid === o.prisoner);
                return `${CARDS[prisoner.id].name}を地下牢に入れて出す${cost}${to}`;
            }
            default: return '出す';
        }
    }

    openCard(src, index, uid) {
        const v = this.view;
        let id;
        let actions = '';
        let extra = '';
        if (src === 'hand') id = this.me().hand[index];
        else if (src === 'meadow') id = v.meadow[index];
        else {
            const owner = v.players[index];
            const c = owner.city.find(x => x.uid === uid);
            if (!c) {
                $('#detail').close();
                return;
            }
            id = c.id;
            const loc = `card-${c.uid}`;
            const notes = [];
            if (c.occupied) notes.push('無料で出すのに使いました');
            if (c.paired) notes.push('夫と妻の組です');
            if (c.tokens) notes.push(`点数トークン ${c.tokens}`);
            if (c.under?.length) notes.push(`中の住民：${c.under.map(x => CARDS[x].name).join('・')}`);
            if (c.res && Object.values(c.res).some(n => n > 0)) notes.push(`上の資源：${resHtml(c.res)}`);
            const here = v.occupancy[loc] ?? [];
            if (here.length) notes.push(`ワーカー：${here.map(s => workerIcon(s)).join('')}`);
            extra = notes.length ? `<p class="detail-notes">${notes.join('<br>')}</p>` : '';
            if (CARDS[id].spot && (owner.id === v.you || CARDS[id].open)) actions = this.placeButton(loc);
        }
        if (!id) return;
        if (src === 'hand' || src === 'meadow') {
            const opts = v.plays.filter(o => o.source === src && o.index === index);
            if (opts.length) {
                actions = opts.map(o => `<button class="btn primary" data-cmd='${JSON.stringify({ type: 'play', source: src, index, method: o.method, ...(o.target !== undefined ? { target: o.target } : {}) })}'>${this.methodLabel(o)}</button>`).join('');
            } else if (this.myTurn()) {
                actions = `<p class="muted note">${this.cantPlayReason(id)}</p>`;
            }
        }
        this.detailTarget = { kind: 'card', src, index, uid, id };
        $('#detail-body').innerHTML = cardDetailHtml(id) + extra;
        $('#detail-actions').innerHTML = actions;
        if (!$('#detail').open) $('#detail').showModal();
    }

    cantPlayReason(id) {
        const me = this.me();
        const def = CARDS[id];
        if (def.unique && me.city.some(c => c.id === id)) return '同じユニークなカードが街にあります';
        if (id !== 'wanderer' && me.slots >= CITY_LIMIT) return '街がいっぱいです';
        return '資源が足りません';
    }

    placeButton(loc) {
        const reason = this.view.reasons[loc];
        if (reason === null) return `<button class="btn primary" data-cmd='${JSON.stringify({ type: 'place', loc })}'>${workerIcon(this.view.you)}ワーカーを置く</button>`;
        return reason ? `<p class="muted note">${reason}</p>` : '';
    }

    openPlace(loc) {
        const v = this.view;
        if (loc.startsWith('card-')) {
            const uid = Number(loc.slice(5));
            const owner = v.players.find(p => p.city.some(c => c.uid === uid));
            if (owner) this.openCard('city', owner.id, uid);
            return;
        }
        let title = '';
        let body = '';
        const basic = BASIC_LOCATIONS.find(l => l.id === loc);
        const forest = FOREST_LOCATIONS.find(l => l.id === loc);
        if (basic) {
            title = '基本の場所';
            body = `<p class="gain-big">${gainHtml(basic)}</p><p>${basic.exclusive ? '1人だけ置けます。' : '何人でも置けます。'}</p>`;
        } else if (forest) {
            title = '森の場所';
            body = forest.text ? `<p>${forest.text}</p>` : `<p class="gain-big">${gainHtml(forest)}</p>`;
            body += `<p>${v.players.length === 4 ? 'ちがう2人まで置けます。' : '1人だけ置けます。'}</p>`;
        } else if (loc === 'haven') {
            title = '港';
            body = '<p>手札を好きなだけ捨て、2枚につき好きな資源を1つ得ます。何人でも置けます。</p>';
        } else if (loc.startsWith('journey-')) {
            const n = Number(loc.slice(8));
            title = `旅（${n}点）`;
            body = `<p>秋だけ使えます。手札を${n}枚捨てて、${n}点を得ます。${n === 2 ? '何人でも置けます。' : '1人だけ置けます。'}</p>`;
        } else if (loc.startsWith('e-')) {
            const e = BASIC_EVENTS.find(x => x.id === loc);
            title = `基本の行事：${e.name}`;
            body = `<p>${TYPES[e.type].long}のカードが街に${e.need}枚あれば、ワーカーを置いて達成できます。3点。</p>`;
        } else if (loc.startsWith('s-')) {
            const e = SPECIAL_EVENTS.find(x => x.id === loc);
            title = `特別な行事：${e.name}`;
            const needs = e.needsTypes ? '' : `<p>条件：${e.needs.map(n => CARDS[n].name).join('と')}が街にあること</p>`;
            body = `${needs}<p>${e.text}</p>`;
        }
        const owner = v.claimed[loc];
        if (owner !== undefined) body += `<p class="muted">${escapeHtml(v.players[owner].name)}が達成しました</p>`;
        const here = v.occupancy[loc] ?? [];
        if (here.length && owner === undefined) body += `<p class="detail-notes">ワーカー：${here.map(s => workerIcon(s)).join('')}</p>`;
        this.detailTarget = { kind: 'place', loc };
        $('#detail-body').innerHTML = `<h2>${title}</h2>${body}`;
        $('#detail-actions').innerHTML = this.placeButton(loc);
        if (!$('#detail').open) $('#detail').showModal();
    }

    openCity(seat) {
        const v = this.view;
        const p = v.players[seat];
        const s = p.score;
        const events = p.events.map(e => SPECIAL_EVENTS.find(x => x.id === e.id)?.name ?? BASIC_EVENTS.find(x => x.id === e.id)?.name).join('・');
        this.cityTarget = seat;
        $('#city-body').innerHTML = `<h2 style="--pc:${PLAYER_COLORS[seat]}" class="city-title">${escapeHtml(p.name)}の街 <small>${p.slots}/${CITY_LIMIT}</small></h2>
            <p class="city-info"><span class="season mini s${p.season}">${SEASON_NAMES[p.season]}</span>${resHtml(p.res, { zero: true })}
            <span>${icon('card')}${p.handCount}</span><span>${workerIcon(seat)}${p.available}/${p.workers}</span></p>
            <p class="city-score">${s.total}点（カード${s.cards}・加点${s.bonus}・トークン${s.tokens}・行事${s.events}・旅${s.journey}）${events ? `<br>行事：${events}` : ''}</p>
            ${this.cityHtml(p)}`;
        if (!$('#city').open) $('#city').showModal();
    }

    // 開いているシートを、新しいビューで描き直す（操作できるかが変わるため）
    refreshOpenSheets() {
        if ($('#city').open && this.cityTarget !== undefined) this.openCity(this.cityTarget);
        if (!$('#detail').open || !this.detailTarget) return;
        const t = this.detailTarget;
        if (t.kind === 'place') this.openPlace(t.loc);
        else if (t.kind === 'card') {
            // 手札や草原は位置が変わるので、同じ位置に同じカードがあるときだけ描き直す
            const now = t.src === 'hand' ? this.me().hand[t.index] : t.src === 'meadow' ? this.view.meadow[t.index] : t.id;
            if (now === t.id) this.openCard(t.src, t.index, t.uid);
            else $('#detail').close();
        }
    }

    // ---- 効果の選択 ----

    syncPrompt() {
        const prompt = this.view.prompt;
        if (!prompt || prompt.waiting) {
            if ($('#prompt').open) $('#prompt').close();
            this.promptId = null;
            return;
        }
        if (this.dismissedPrompt === prompt.id) return;
        if (this.promptId !== prompt.id) this.openPrompt();
    }

    openPrompt() {
        const prompt = this.view.prompt;
        if (!prompt || prompt.waiting) return;
        this.promptId = prompt.id;
        this.selected = new Set();
        $('#detail').close();
        $('#city').close();
        $('#prompt-title').textContent = prompt.title;
        $('#prompt-shown').innerHTML = prompt.shown
            ? `<p class="muted note">めくったカード</p><div class="grid4">${prompt.shown.map(id => cardHtml(id, { cls: 'static' })).join('')}</div>` : '';
        const single = prompt.min === 1 && prompt.max === 1;
        $('#prompt-options').innerHTML = prompt.options.map(o => {
            if (o.card) return cardHtml(o.card, { data: { value: o.value }, cls: 'opt', note: o.cost ? costHtml(o.cost) : '' });
            if (o.res) return `<button class="opt chip" data-value="${o.value}" type="button">${icon(o.res)}${escapeHtml(o.label)}</button>`;
            if (o.seat !== undefined) return `<button class="opt chip" data-value="${o.value}" type="button" style="--pc:${PLAYER_COLORS[o.seat]}">${workerIcon(o.seat)}${escapeHtml(o.label)}</button>`;
            return `<button class="opt chip wide" data-value="${o.value}" type="button">${escapeHtml(o.label)}</button>`;
        }).join('');
        $('#prompt-options').classList.toggle('cards', prompt.options.some(o => o.card));
        $('#prompt-ok').hidden = single;
        this.updatePromptOk();
        if (!$('#prompt').open) $('#prompt').showModal();
    }

    onPromptOption(event) {
        const el = event.target.closest('[data-value]');
        const prompt = this.view?.prompt;
        if (!el || !prompt || prompt.waiting) return;
        const value = el.dataset.value;
        if (prompt.min === 1 && prompt.max === 1) return this.sendPrompt([value]);
        if (this.selected.has(value)) this.selected.delete(value);
        else if (this.selected.size < prompt.max) this.selected.add(value);
        else if (prompt.max === 1) this.selected = new Set([value]);
        document.querySelectorAll('#prompt-options [data-value]').forEach(x => x.classList.toggle('picked', this.selected.has(x.dataset.value)));
        this.updatePromptOk();
    }

    updatePromptOk() {
        const prompt = this.view.prompt;
        const n = this.selected.size;
        const ok = n >= prompt.min && n <= prompt.max;
        $('#prompt-ok').disabled = !ok;
        $('#prompt-ok').textContent = n === 0 && prompt.min === 0 ? '選ばずに決定' : `決定（${n}）`;
    }

    sendPrompt(values) {
        const prompt = this.view?.prompt;
        if (!prompt || prompt.waiting) return;
        $('#prompt').close();
        this.promptId = null;
        this.send({ type: 'answer', id: prompt.id, values });
    }

    dismissPrompt() {
        this.dismissedPrompt = this.view.prompt?.id ?? null;
        $('#prompt').close();
        this.renderActions();
    }

    // ---- 記録と結果 ----

    showLog() {
        const logs = this.view?.logs ?? [];
        $('#log-list').innerHTML = logs.map(t => `<li>${escapeHtml(t)}</li>`).join('');
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // id はシードから作る（同じ対戦を2回数えない）
    recordLocalResult(view) {
        const controller = this.controller;
        if (!controller || controller.isOnline || !view || !(view.phase === 'end')) return;
        const id = `${GAME}-${controller.game.options.seed}`;
        if (this.recordedId === id) return;
        this.recordedId = id;
        recordResult({ game: GAME, id, outcome: outcomeFromWinners(view.winners, view.you, view.players.length) });
    }

    showResult() {
        this.recordLocalResult(this.view);
        const v = this.view;
        if (!v || v.phase !== 'end') return;
        this.resultShown = true;
        const ranked = [...v.results].sort((a, b) => b.total - a.total);
        const youWon = v.winners.includes(v.you);
        $('#result-title').textContent = youWon
            ? (v.winners.length > 1 ? '同点で勝ち' : 'あなたの勝ち')
            : `${v.winners.map(id => v.players[id].name).join('と')}の勝ち`;
        $('#result-list').innerHTML = ranked.map(r => `<tr class="${v.winners.includes(r.seat) ? 'winner' : ''} ${r.seat === v.you ? 'mine' : ''}">
            <th style="--pc:${PLAYER_COLORS[r.seat]}">${escapeHtml(v.players[r.seat].name)}</th><td>${r.cards}</td><td>${r.bonus}</td><td>${r.tokens}</td>
            <td>${r.events}</td><td>${r.journey}</td><td class="total">${r.total}</td></tr>`).join('');
        if (!$('#result').open) $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
    }
}
