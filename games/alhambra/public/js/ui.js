/**
 * 画面（タイトル・ゲーム・得点の見込み・得点・結果・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 */

import { TILES, TYPES, TYPE_NAMES, CURRENCIES, CURRENCY_NAMES, SCORING, FOUNTAIN, TAKE_LIMIT, rankPoints, MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import { keyOf, parseKey, placeSpots, placeError, removeError, swapError, longestWall, countTypes } from './layout.js';
import { bestPayment } from './cpu-player.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { symbolsSvg, tileHtml, moneyHtml, coinHtml } from './art.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';

const SETTINGS_KEY = 'alhambra.settings';
const CPU_NAMES = ['ルカ', 'ミラ', 'ノア', 'エマ', 'カイ'];
const RESULT_DELAY_MS = 700;
const ROUND_NAMES = ['1回目', '2回目', '3回目'];

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [2, 3, 4, 5, 6].includes(saved.count) ? saved.count : 3,
            level: ['easy', 'normal'].includes(saved.level) ? saved.level : 'normal'
        };
    } catch {
        return { count: 3, level: 'normal' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// 次の得点で、自分が得る点の見込み（建物の多数＋城壁）
function projectPoints(view, layout, round) {
    if (round > 2) return 0;
    const me = view.you;
    const myCounts = countTypes(layout);
    let total = longestWall(layout);
    TYPES.forEach(type => {
        const entries = view.players.map(p => ({ id: p.id, count: p.id === me ? myCounts[type] : p.counts[type] }));
        if (view.dirk) entries.push({ id: 'dirk', count: view.dirk.counts[type] });
        total += rankPoints(entries, SCORING[round][type]).get(me) ?? 0;
    });
    return total;
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        // 選んでいるもの：{ kind: 'money', slots } / { kind: 'buy', slot, cards } / { kind: 'reserve', tile } / { kind: 'tile', x, y }
        this.sel = null;
        this.target = null;      // 置く先・足す先・入れ替える先 { x, y }
        this.placeIndex = 0;     // 置く建物が複数あるとき、どれを置くか
        this.lastSeq = 0;
        this.fresh = new Set();
        this.seenRounds = 0;
        this.resultTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        this.bindStatic();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'アルハンブラ',
            game: 'alhambra',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 800,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [],
            onStart: (controller) => this.begin(controller),
            onUpdate: () => this.render(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            },
            onExit: () => this.showTitle()
        });
        this.renderTitleArt();
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
                onUpdate: () => this.render(),
                onError: (message) => {
                    music.play('error');
                    this.toast(message);
                }
            });
        } catch (error) {
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.begin(controller);
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    begin(controller) {
        if (this.controller !== controller) this.stopGame();
        this.controller = controller;
        this.sel = null;
        this.target = null;
        this.view = null;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        const view = this.controller.getView();
        this.lastSeq = view.events.at(-1)?.seq ?? 0;
        this.seenRounds = view.roundsScored;
        this.render();
        if (!controller.isOnline) controller.scheduleCpu();
    }

    newGame() {
        const { count, level } = this.settings;
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true, cpuLevel: level }))];
        this.startGame({ players, options: {} });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        ['#scores', '#player-detail'].forEach(id => { if ($(id).open) $(id).close(); });
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#player-count').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-count]');
            if (!button) return;
            this.settings.count = Number(button.dataset.count);
            saveSettings(this.settings);
            this.renderSetup();
        });
        $('#cpu-level').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-level]');
            if (!button) return;
            this.settings.level = button.dataset.level;
            saveSettings(this.settings);
            this.renderSetup();
        });
        $('#start').addEventListener('click', () => this.newGame());
        $('#online-button').addEventListener('click', () => this.online.open());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle())); // オンラインは確かめてから部屋を出る
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#score-button').addEventListener('click', () => this.showProjection());
        $('#hint').addEventListener('click', () => this.showHint());
        $('#players').addEventListener('click', (event) => {
            const chip = event.target.closest('[data-player]');
            if (chip) this.showPlayer(chip.dataset.player);
        });

        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
        $('#scores-buttons').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button) return;
            $('#scores').close();
            const online = this.controller?.isOnline;
            // オンライン対戦は、ロビーを出してホストの「もう一度」で再戦する。ホームは部屋を出る
            if (button.dataset.act === 'again') online ? this.online.rematch() : this.newGame();
            if (button.dataset.act === 'home') online ? this.online.leave() : this.showTitle();
        });

        $('#market').addEventListener('click', (event) => {
            const slot = event.target.closest('[data-slot]');
            if (slot) this.pickMarket(Number(slot.dataset.slot));
        });
        $('#money-market').addEventListener('click', (event) => {
            const slot = event.target.closest('[data-money]');
            if (slot) this.pickMoney(Number(slot.dataset.money));
        });
        $('#hand').addEventListener('click', (event) => {
            const card = event.target.closest('[data-card]');
            if (card) this.pickHandCard(Number(card.dataset.card));
        });
        $('#reserve').addEventListener('click', (event) => {
            const tile = event.target.closest('[data-reserve]');
            if (tile) this.pickReserve(Number(tile.dataset.reserve));
        });
        $('#alhambra').addEventListener('click', (event) => {
            const cell = event.target.closest('[data-x]');
            if (cell) this.pickCell(Number(cell.dataset.x), Number(cell.dataset.y));
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            this.act(button.dataset.act, button.dataset);
        });

        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    renderTitleArt() {
        const ids = [TILES.find(t => t.type === 'tower' && t.cost === 7).id, TILES.find(t => t.type === 'garden' && t.cost === 10 && t.walls.n).id,
            TILES.find(t => t.type === 'seraglio' && t.cost === 4).id, TILES.find(t => t.type === 'chambers' && t.cost === 6).id];
        $('#title-art').innerHTML = `<div class="title-grid">
            <span>${tileHtml(ids[0], { cost: false })}</span><span>${tileHtml(ids[1], { cost: false })}</span><span>${tileHtml(ids[2], { cost: false })}</span>
            <span></span><span>${tileHtml(FOUNTAIN)}</span><span>${tileHtml(ids[3], { cost: false })}</span></div>
            <div class="title-money">${CURRENCIES.map((c, i) => moneyHtml({ currency: c, value: [3, 7, 5, 9][i] })).join('')}</div>`;
    }

    // ---- 状態 ----

    get me() {
        return this.view.players[this.view.you];
    }

    myTurn(phase) {
        const view = this.view;
        return !!view && view.actor === view.you && (!phase || view.phase === phase);
    }

    // 置く段階で、今置く建物
    tileToPlace() {
        const list = this.view.toPlace;
        if (list.length === 0) return null;
        return list[Math.min(this.placeIndex, list.length - 1)];
    }

    // ---- 選ぶ操作 ----

    pickMoney(slot) {
        if (!this.myTurn('action') || !this.view.moneyMarket[slot]) return;
        music.play('select');
        const slots = this.sel?.kind === 'money' ? new Set(this.sel.slots) : new Set();
        if (slots.has(slot)) slots.delete(slot);
        else slots.add(slot);
        this.sel = slots.size ? { kind: 'money', slots: [...slots].sort() } : null;
        this.target = null;
        this.render();
    }

    pickMarket(slot) {
        if (!this.myTurn('action') || this.view.market[slot].tile === null) return;
        music.play('select');
        if (this.sel?.kind === 'buy' && this.sel.slot === slot) {
            this.sel = null;
        } else {
            // 払い過ぎが最も少ない払い方を、先に選んでおく
            const cards = this.me.hand.filter(c => c.currency === CURRENCIES[slot]);
            const pay = bestPayment(cards, TILES[this.view.market[slot].tile].cost);
            this.sel = { kind: 'buy', slot, cards: pay ? pay.ids : [] };
        }
        this.target = null;
        this.render();
    }

    pickHandCard(id) {
        if (this.sel?.kind !== 'buy') return;
        const card = this.me.hand.find(c => c.id === id);
        if (!card || card.currency !== CURRENCIES[this.sel.slot]) return;
        music.play('select');
        const cards = new Set(this.sel.cards);
        if (cards.has(id)) cards.delete(id);
        else cards.add(id);
        this.sel = { ...this.sel, cards: [...cards] };
        this.render();
    }

    pickReserve(tile) {
        if (!this.myTurn('action')) return;
        this.sel = this.sel?.kind === 'reserve' && this.sel.tile === tile ? null : { kind: 'reserve', tile };
        this.target = null;
        this.render();
    }

    pickCell(x, y) {
        const view = this.view;
        if (!view) return;
        const layout = this.me.layout;
        const occupied = layout[keyOf(x, y)] !== undefined;
        if (this.myTurn('place') || this.myTurn('final')) {
            if (occupied) return;
            const reason = placeError(layout, this.tileToPlace(), x, y);
            if (reason) {
                this.toast(reason);
                this.target = null;
            } else {
                this.target = { x, y };
            }
            return this.render();
        }
        if (!this.myTurn('action')) return;
        if (this.sel?.kind === 'reserve') {
            const reason = occupied ? swapError(layout, this.sel.tile, x, y) : placeError(layout, this.sel.tile, x, y);
            if (reason) {
                this.toast(reason);
                this.target = null;
            } else {
                this.target = { x, y };
            }
            return this.render();
        }
        // 何も選んでいなければ、アルハンブラの建物を選ぶ（予備へ戻す）
        if (occupied && layout[keyOf(x, y)] !== FOUNTAIN) {
            this.sel = this.sel?.kind === 'tile' && this.sel.x === x && this.sel.y === y ? null : { kind: 'tile', x, y };
            this.target = null;
            this.render();
        }
    }

    act(action, data) {
        const sel = this.sel;
        const send = (command) => {
            this.sel = null;
            this.target = null;
            this.controller?.send(command);
        };
        if (action === 'cancel') {
            this.sel = null;
            this.target = null;
            this.render();
        } else if (action === 'take' && sel?.kind === 'money') send({ type: 'take', slots: sel.slots });
        else if (action === 'buy' && sel?.kind === 'buy') send({ type: 'buy', slot: sel.slot, cards: sel.cards });
        else if (action === 'add' && sel?.kind === 'reserve' && this.target) send({ type: 'redesign', op: 'add', tile: sel.tile, x: this.target.x, y: this.target.y });
        else if (action === 'swap' && sel?.kind === 'reserve' && this.target) send({ type: 'redesign', op: 'swap', tile: sel.tile, x: this.target.x, y: this.target.y });
        else if (action === 'remove' && sel?.kind === 'tile') send({ type: 'redesign', op: 'remove', x: sel.x, y: sel.y });
        else if (action === 'end') send({ type: 'end' });
        else if (action === 'place' && this.target) send({ type: 'place', tile: this.tileToPlace(), to: 'alhambra', x: this.target.x, y: this.target.y });
        else if (action === 'reserve') send({ type: 'place', tile: this.tileToPlace(), to: 'reserve' });
        else if (action === 'dirk') send({ type: 'place', tile: this.tileToPlace(), to: 'dirk' });
        else if (action === 'next-tile') {
            this.placeIndex = (this.placeIndex + 1) % this.view.toPlace.length;
            this.target = null;
            this.render();
        }
    }

    // ---- 描く ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        this.view = view;
        $('#hint').hidden = Boolean(this.controller.isOnline); // ヒントはローカル対戦だけ
        if (!this.myTurn()) {
            this.sel = null;
            this.target = null;
        }
        if (view.toPlace.length === 0) this.placeIndex = 0;
        this.validate();
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        this.playSounds(view, fresh);
        this.fresh = new Set(fresh.filter(e => e.seat === view.you && (e.type === 'place' || e.type === 'redesign') && e.x !== null).map(e => keyOf(e.x, e.y)));

        this.renderPlayers();
        this.renderMarket();
        this.renderMoney();
        this.renderAlhambra();
        this.renderMine();
        this.renderActions();
        this.afterRender();
    }

    // 効果音：新しいできごとを見て、1回の更新に1つだけ鳴らす
    // 自分の手はお金を取る（得る）・買う（払う）・置く、ほかの人の手のあとは自分の番か知らせ、終局は勝ち・負け
    playSounds(view, fresh) {
        const end = fresh.find(e => e.type === 'end');
        if (end) {
            if (!end.winners.includes(view.you)) return music.play('lose');
            return music.play(end.winners.length > 1 ? 'notify' : 'win');
        }
        const acts = fresh.filter(e => e.type !== 'turn' && e.type !== 'score');
        if (!acts.length) {
            if (fresh.some(e => e.type === 'score')) music.play('notify');
            return;
        }
        if (acts.every(e => e.seat === view.you)) {
            const last = acts.at(-1).type;
            return music.play(last === 'take' ? 'gain' : last === 'buy' ? 'pay' : 'place');
        }
        music.play(this.myTurn() ? 'turn' : 'notify');
    }

    // 選んでいたものがなくなったら外す
    validate() {
        const view = this.view;
        const sel = this.sel;
        if (!sel) return;
        if (sel.kind === 'money' && sel.slots.some(s => !view.moneyMarket[s])) this.sel = null;
        if (sel.kind === 'buy' && view.market[sel.slot].tile === null) this.sel = null;
        if (sel.kind === 'reserve' && !this.me.reserve.includes(sel.tile)) this.sel = null;
        if (sel.kind === 'tile' && this.me.layout[keyOf(sel.x, sel.y)] === undefined) this.sel = null;
        if (!this.myTurn('action') && sel) this.sel = null;
    }

    afterRender() {
        const view = this.view;
        if (view.roundsScored > this.seenRounds) {
            const round = view.roundsScored - 1;
            this.seenRounds = view.roundsScored;
            clearTimeout(this.resultTimer);
            this.resultTimer = setTimeout(() => this.showRound(round, view.phase === 'end'), RESULT_DELAY_MS);
        }
    }

    renderPlayers() {
        const view = this.view;
        const chips = view.players.map(p => `<button class="pchip ${p.id === view.actor ? 'active' : ''} ${p.id === view.you ? 'me' : ''}" data-player="${p.id}"
            aria-label="${escapeHtml(p.name)}"><span class="pname">${escapeHtml(p.name)}</span><b>${p.score}</b>
            <span class="psub">${p.handCount}枚</span></button>`);
        if (view.dirk) chips.push(`<button class="pchip dirk" data-player="dirk" aria-label="ダーク"><span class="pname">ダーク</span><b>${view.dirk.score}</b>
            <span class="psub">建物${view.dirk.tiles.length}</span></button>`);
        $('#players').innerHTML = chips.join('');
    }

    // 建物の市場。自分の手札で、ちょうど払えるか・買えるかを印で出す
    renderMarket() {
        const view = this.view;
        const mine = this.myTurn('action');
        $('#market').innerHTML = view.market.map(({ tile, currency }, slot) => {
            if (tile === null) return `<div class="mslot empty" data-slot="${slot}">${coinHtml(currency)}</div>`;
            const cards = this.me.hand.filter(c => c.currency === currency);
            const pay = bestPayment(cards, TILES[tile].cost);
            const mark = pay ? (pay.over === 0 ? '<span class="pay exact">ちょうど</span>' : '<span class="pay ok">買える</span>') : '';
            const selected = this.sel?.kind === 'buy' && this.sel.slot === slot;
            return `<button class="mslot ${selected ? 'selected' : ''} ${mine ? '' : 'idle'}" data-slot="${slot}" aria-label="${CURRENCY_NAMES[currency]}の場所 ${TYPE_NAMES[TILES[tile].type]} ${TILES[tile].cost}">
                ${tileHtml(tile)}<span class="mfoot">${coinHtml(currency)}${mark}</span></button>`;
        }).join('');
    }

    renderMoney() {
        const view = this.view;
        const picked = this.sel?.kind === 'money' ? this.sel.slots : [];
        $('#money-market').innerHTML = view.moneyMarket.map((card, slot) => (card
            ? `<button class="mcard ${picked.includes(slot) ? 'selected' : ''}" data-money="${slot}">${moneyHtml(card)}</button>`
            : '<span class="mcard empty"></span>')).join('');
    }

    renderAlhambra() {
        const view = this.view;
        const layout = { ...this.me.layout };
        // 光らせる場所：置ける場所・足せる場所・入れ替えられる建物
        let spots = [];
        let swaps = [];
        const placing = this.myTurn('place') || this.myTurn('final') ? this.tileToPlace() : null;
        if (placing !== null) spots = placeSpots(layout, placing);
        if (this.myTurn('action') && this.sel?.kind === 'reserve') {
            spots = placeSpots(layout, this.sel.tile);
            swaps = Object.keys(layout).map(parseKey).filter(([x, y]) => swapError(layout, this.sel.tile, x, y) === null);
        }
        const spotSet = new Set(spots.map(([x, y]) => keyOf(x, y)));
        const swapSet = new Set(swaps.map(([x, y]) => keyOf(x, y)));
        const ghost = this.target ? (placing ?? this.sel?.tile) : null;
        const keys = [...Object.keys(layout), ...spotSet].map(parseKey);
        const minX = Math.min(...keys.map(([x]) => x)) - 1, maxX = Math.max(...keys.map(([x]) => x)) + 1;
        const minY = Math.min(...keys.map(([, y]) => y)) - 1, maxY = Math.max(...keys.map(([, y]) => y)) + 1;
        const el = $('#alhambra');
        el.style.setProperty('--cols', maxX - minX + 1);
        el.style.setProperty('--rows', maxY - minY + 1);
        const cells = [];
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const key = keyOf(x, y);
                const tile = layout[key];
                const isTarget = this.target && this.target.x === x && this.target.y === y;
                const cls = ['cell'];
                let inner = '';
                if (isTarget && ghost !== null && ghost !== undefined) {
                    cls.push('ghost');
                    inner = tileHtml(ghost);
                } else if (tile !== undefined) {
                    cls.push('built');
                    if (swapSet.has(key)) cls.push('swappable');
                    if (this.sel?.kind === 'tile' && this.sel.x === x && this.sel.y === y) cls.push('selected');
                    if (this.fresh.has(key)) cls.push('fresh');
                    inner = tileHtml(tile, { cost: false });
                } else if (spotSet.has(key)) {
                    cls.push('spot');
                }
                cells.push(`<button class="${cls.join(' ')}" data-x="${x}" data-y="${y}" aria-label="${x},${y}">${inner}</button>`);
            }
        }
        el.innerHTML = cells.join('');
        const next = projectPoints(view, layout, view.roundsScored);
        $('#score-button').innerHTML = view.roundsScored < 3 ? `${ROUND_NAMES[view.roundsScored]}の見込み <b>${next}</b>` : '得点';
    }

    renderMine() {
        const buying = this.sel?.kind === 'buy' ? this.sel : null;
        const groups = CURRENCIES.map(currency => {
            const cards = this.me.hand.filter(c => c.currency === currency).sort((a, b) => a.value - b.value);
            const total = cards.reduce((s, c) => s + c.value, 0);
            const active = buying && CURRENCIES[buying.slot] === currency;
            const dim = buying && !active;
            return `<div class="hgroup ${active ? 'active' : ''} ${dim ? 'dim' : ''}" style="--n:${cards.length}">
                <span class="htotal">${coinHtml(currency)}${total}</span>
                <span class="hcards">${cards.map(c => `<button class="hcard ${buying?.cards.includes(c.id) ? 'selected' : ''}" data-card="${c.id}" ${active ? '' : 'tabindex="-1"'}>${moneyHtml(c)}</button>`).join('')}</span>
            </div>`;
        }).join('');
        $('#hand').innerHTML = groups;
        const reserve = this.me.reserve;
        $('#reserve').innerHTML = reserve.length
            ? `<span class="rlabel">予備</span><span class="rtiles">${reserve.map(t => `<button class="rtile ${this.sel?.kind === 'reserve' && this.sel.tile === t ? 'selected' : ''}" data-reserve="${t}">${tileHtml(t)}</button>`).join('')}</span>`
            : '<span class="rlabel muted">予備なし</span>';
    }

    renderActions() {
        const view = this.view;
        const sel = this.sel;
        const cancel = '<button class="btn small ghost" data-act="cancel" aria-label="やめる">×</button>';
        let html;
        if (this.myTurn('place') || this.myTurn('final')) {
            const tile = this.tileToPlace();
            const more = view.toPlace.length > 1 ? `<button class="btn small ghost" data-act="next-tile">次（${view.toPlace.length}）</button>` : '';
            const gain = this.target ? this.gainText(tile, this.target) : '<span class="act-hint">置く場所を選ぶ</span>';
            html = `<span class="act-tile">${tileHtml(tile)}</span>${more}<span class="act-label">${gain}</span>
                <button class="btn small primary" data-act="place" ${this.target ? '' : 'disabled'}>置く</button>
                <button class="btn small secondary" data-act="reserve">予備へ</button>
                ${view.dirk && this.myTurn('place') ? '<button class="btn small secondary" data-act="dirk">ダークへ</button>' : ''}`;
        } else if (!this.myTurn('action')) {
            html = `<span class="act-log">${escapeHtml(view.logs.at(-1) ?? '')}</span>`;
        } else if (sel?.kind === 'money') {
            const cards = sel.slots.map(s => view.moneyMarket[s]);
            const total = cards.reduce((s, c) => s + c.value, 0);
            const ok = cards.length === 1 || total <= TAKE_LIMIT;
            html = `<span class="act-label">${ok ? `合計 <b>${total}</b>` : `<span class="act-error">何枚かなら合計${TAKE_LIMIT}まで</span>`}</span>
                <button class="btn small primary" data-act="take" ${ok ? '' : 'disabled'}>取る</button>${cancel}`;
        } else if (sel?.kind === 'buy') {
            const tile = view.market[sel.slot].tile;
            const cost = TILES[tile].cost;
            const paid = sel.cards.reduce((s, id) => s + this.me.hand.find(c => c.id === id).value, 0);
            let status;
            if (paid < cost) status = `<span class="act-error">${CURRENCY_NAMES[CURRENCIES[sel.slot]]}があと${cost - paid}足りない</span>`;
            else if (paid === cost) status = '<span class="act-gain">ちょうど・もう一度行動できる</span>';
            else status = `<span class="act-warn">${paid - cost}多く払う（おつりなし）</span>`;
            html = `<span class="act-label">${coinHtml(CURRENCIES[sel.slot])}<b>${paid}</b>/${cost}　${status}</span>
                <button class="btn small primary" data-act="buy" ${paid >= cost ? '' : 'disabled'}>買う</button>${cancel}`;
        } else if (sel?.kind === 'reserve') {
            const occupied = this.target && this.me.layout[keyOf(this.target.x, this.target.y)] !== undefined;
            const layout = this.me.layout;
            const none = placeSpots(layout, sel.tile).length === 0
                && Object.keys(layout).map(parseKey).every(([x, y]) => swapError(layout, sel.tile, x, y) !== null);
            const label = this.target ? this.gainText(sel.tile, this.target)
                : none ? '<span class="act-hint">今は置ける場所も、入れ替えられる建物もない</span>'
                    : '<span class="act-hint">足す場所か、入れ替える建物を選ぶ</span>';
            html = `<span class="act-tile">${tileHtml(sel.tile)}</span><span class="act-label">${label}</span>
                <button class="btn small primary" data-act="${occupied ? 'swap' : 'add'}" ${this.target ? '' : 'disabled'}>${occupied ? '入れ替える' : '足す'}</button>${cancel}`;
        } else if (sel?.kind === 'tile') {
            const reason = removeError(this.me.layout, sel.x, sel.y);
            html = `<span class="act-label">${reason ? `<span class="act-error">${reason}</span>` : '<span class="act-hint">この建物を予備へ戻す</span>'}</span>
                <button class="btn small secondary" data-act="remove" ${reason ? 'disabled' : ''}>予備へ戻す</button>${cancel}`;
        } else {
            const hint = view.actionsTaken > 0 ? 'もう一度行動できる' : 'お金を取るか、建物を買う';
            html = `<span class="act-label"><span class="act-hint">${hint}</span></span>${view.canEnd ? '<button class="btn small secondary" data-act="end">手番を終える</button>' : ''}`;
        }
        $('#actions').innerHTML = html;
        if (this.hint && this.hint.key === this.lastSeq) $(`#actions [data-act="${this.hint.act}"]`)?.classList.add('recommended');
    }

    // ヒント：CPU（ふつう）が選ぶ操作を、選んだ状態にして、押すボタンに印を付ける
    showHint() {
        const c = this.controller?.hint();
        if (!c) return this.toast('自分の番になったら、おすすめを出せます');
        this.sel = null;
        this.target = null;
        let act = c.type;
        let text;
        if (c.type === 'take') {
            this.sel = { kind: 'money', slots: [...c.slots].sort() };
            text = 'お金を取る';
        } else if (c.type === 'buy') {
            this.sel = { kind: 'buy', slot: c.slot, cards: [...c.cards] };
            text = `${CURRENCY_NAMES[CURRENCIES[c.slot]] ?? ''}の建物を買う`;
        } else if (c.type === 'place') {
            this.placeIndex = Math.max(0, this.view.toPlace.indexOf(c.tile));
            if (c.to === 'alhambra') this.target = { x: c.x, y: c.y };
            act = c.to === 'alhambra' ? 'place' : c.to;
            text = c.to === 'alhambra' ? '光る場所に置く' : c.to === 'reserve' ? '予備へ置く' : 'ダークへ渡す';
        } else if (c.type === 'redesign') {
            this.sel = { kind: 'reserve', tile: c.tile };
            this.target = { x: c.x, y: c.y };
            act = 'add';
            text = '予備の建物を光る場所に足す';
        } else {
            text = '手番を終える';
        }
        this.hint = { key: this.lastSeq, act };
        this.render();
        this.toast(`おすすめ：${text}`);
    }

    // 置いたときの、次の得点の見込みの増え方
    gainText(tile, { x, y }) {
        const view = this.view;
        const layout = this.me.layout;
        const after = { ...layout, [keyOf(x, y)]: tile };
        if (view.roundsScored > 2) return '';
        const diff = projectPoints(view, after, view.roundsScored) - projectPoints(view, layout, view.roundsScored);
        const wall = longestWall(after) - longestWall(layout);
        return `<span class="act-gain">${ROUND_NAMES[view.roundsScored]}の見込み ${diff >= 0 ? '+' : ''}${diff}${wall ? `（城壁${wall > 0 ? '+' : ''}${wall}）` : ''}</span>`;
    }

    // ---- ダイアログ ----

    // 次の得点の見込み：種類ごとの枚数と、自分の点
    showProjection() {
        const view = this.view;
        if (!view) return;
        const round = Math.min(view.roundsScored, 2);
        const people = [...view.players.map(p => ({ id: p.id, name: p.name, counts: p.counts })), ...(view.dirk ? [{ id: 'dirk', name: 'ダーク', counts: view.dirk.counts }] : [])];
        const head = `<tr><th></th>${people.map(p => `<th>${escapeHtml(p.name)}</th>`).join('')}<th>点</th></tr>`;
        const rows = TYPES.map(type => {
            const entries = people.map(p => ({ id: p.id, count: p.counts[type] }));
            const points = rankPoints(entries, SCORING[round][type]);
            return `<tr><th>${tileHtml(TILES.find(t => t.type === type).id, { cost: false, cls: 'mini' })}<span class="tname">${TYPE_NAMES[type]}</span></th>
                ${people.map(p => `<td class="${(points.get(p.id) ?? 0) > 0 ? 'lead' : ''}">${p.counts[type]}</td>`).join('')}
                <td class="pts">${SCORING[round][type].join('/')}</td></tr>`;
        }).join('');
        const walls = `<tr><th>城壁</th>${view.players.map(p => `<td>${p.wall}</td>`).join('')}${view.dirk ? '<td>-</td>' : ''}<td class="pts">1区画1点</td></tr>`;
        const projections = `<tr class="sum"><th>見込み</th>${view.players.map(p => `<td><b>${projectPoints({ ...view, you: p.id }, p.layout, round)}</b></td>`).join('')}${view.dirk ? '<td>-</td>' : ''}<td></td></tr>`;
        $('#scores-title').textContent = view.roundsScored > 2 ? '最後の得点' : `${ROUND_NAMES[round]}の得点の見込み`;
        $('#scores-body').innerHTML = `<table class="score-table">${head}${rows}${walls}${projections}</table>
            <p class="muted">金色の数は、今点を得る順位にいる人。点は 1位/2位/3位</p>`;
        $('#scores-buttons').innerHTML = '<button class="btn secondary" data-act="close">閉じる</button>';
        if (!$('#scores').open) $('#scores').showModal();
    }

    // 得点した回の内訳。final：結果として出す
    showRound(round, final) {
        const view = this.view;
        if (!view) return;
        const people = [...view.players.map(p => ({ name: p.name, rounds: p.rounds, score: p.score, id: p.id })), ...(view.dirk ? [{ name: 'ダーク', rounds: view.dirk.rounds, score: view.dirk.score, id: 'dirk' }] : [])];
        const head = `<tr><th></th>${TYPES.map(t => `<th>${tileHtml(TILES.find(x => x.type === t).id, { cost: false, cls: 'mini' })}</th>`).join('')}<th>城壁</th><th>計</th><th>合計</th></tr>`;
        const rows = people.map(p => {
            const r = p.rounds[round];
            if (!r) return '';
            const win = final && view.winners.includes(p.id);
            return `<tr class="${win ? 'winner' : ''}"><th>${escapeHtml(p.name)}</th>${TYPES.map(t => `<td>${r.types[t] ?? ''}</td>`).join('')}
                <td>${p.id === 'dirk' ? '-' : r.wall}</td><td><b>${r.total}</b></td><td class="sum"><b>${p.score}</b></td></tr>`;
        }).join('');
        const title = final
            ? (view.winners.length > 1 ? '引き分け' : view.winners[0] === view.you ? 'あなたの勝ち' : `${view.players[view.winners[0]].name}の勝ち`)
            : `${ROUND_NAMES[round]}の得点`;
        $('#scores-title').textContent = title;
        $('#scores-body').innerHTML = `<table class="score-table round">${head}${rows}</table>`;
        $('#scores-buttons').innerHTML = final
            ? '<button class="btn primary" data-act="again">もう一度</button><button class="btn secondary" data-act="home">ホーム</button>'
            : '<button class="btn secondary" data-act="close">閉じる</button>';
        if (!$('#scores').open) $('#scores').showModal();
    }

    showPlayer(id) {
        const view = this.view;
        if (!view) return;
        if (id === 'dirk') {
            $('#player-detail-name').textContent = `ダーク　${view.dirk.score}点`;
            $('#player-detail-body').innerHTML = `<div class="tile-row">${view.dirk.tiles.map(t => tileHtml(t, { cls: 'mini' })).join('')}</div>`;
            $('#player-detail').showModal();
            return;
        }
        const p = view.players[Number(id)];
        $('#player-detail-name').textContent = `${p.name}　${p.score}点`;
        const keys = Object.keys(p.layout).map(parseKey);
        const minX = Math.min(...keys.map(([x]) => x)), maxX = Math.max(...keys.map(([x]) => x));
        const minY = Math.min(...keys.map(([, y]) => y)), maxY = Math.max(...keys.map(([, y]) => y));
        const cells = [];
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const tile = p.layout[keyOf(x, y)];
                cells.push(`<span class="cell">${tile !== undefined ? tileHtml(tile, { cost: false }) : ''}</span>`);
            }
        }
        $('#player-detail-body').innerHTML = `<div class="alhambra small" style="--cols:${maxX - minX + 1};--rows:${maxY - minY + 1}">${cells.join('')}</div>
            <p class="muted">お金 ${p.handCount}枚・城壁 ${p.wall}・予備 ${p.reserve.length}</p>
            ${p.reserve.length ? `<div class="tile-row">${p.reserve.map(t => tileHtml(t, { cls: 'mini' })).join('')}</div>` : ''}`;
        $('#player-detail').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
    }
}
