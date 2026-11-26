/**
 * 画面（タイトル・ゲーム・ダイアログ）
 * 画面はビューだけを見て描く。操作はコントローラーの send() に渡す
 */

import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { MIN_PLAYERS, MAX_PLAYERS, DECK_SLOT, routeBlockReason, paymentOptions, connected } from './game.js';
import { CITIES, ROUTES, TICKETS, COLORS, LOCO, COLOR_NAMES, ROUTE_POINTS } from './map.js';
import { mapSvg, cardSvg, nearestRoute, PLAYER_COLORS, LINE_ICONS } from './art.js';
import { HELP_HTML } from './help.js';
import { suggest } from './cpu-player.js';
import { music } from './music.js';

const SETTINGS_KEY = 'ticket-to-ride.settings';
const CPU_NAMES = ['ジョー', 'メイ', 'サム', 'ルーシー'];
const HAND_ORDER = [...COLORS, LOCO];

const $ = (id) => document.getElementById(id);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ticketName = (t) => `${CITIES[t.a].name} – ${CITIES[t.b].name}`;
const routeName = (r) => `${CITIES[r.a].name}–${CITIES[r.b].name}`;

function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: Number.isInteger(s.count) && s.count >= MIN_PLAYERS && s.count <= MAX_PLAYERS ? s.count : 3,
            level: s.level === 'easy' ? 'easy' : 'normal'
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

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.selected = null;     // 選んだ路線
        this.payIndex = 0;        // 選んだ払い方
        this.picked = new Set();  // 目的地を選ぶダイアログで、残すもの
        this.resultShown = false;
        $('home').innerHTML = LINE_ICONS.home;
        $('open-help-game').innerHTML = LINE_ICONS.help;
        $('open-log').innerHTML = LINE_ICONS.log;
        $('help-body').innerHTML = HELP_HTML;
        $('title-art').innerHTML = mapSvg({ claimed: ROUTES.map(r => [3, 17, 24, 40, 56, 66, 71, 88].includes(r.id) ? r.id % 3 : null) });
        this.bindTitle();
        this.bindGame();
        document.addEventListener('contextmenu', event => event.preventDefault());
    }

    // ---- タイトル ----

    bindTitle() {
        $('count-down').addEventListener('click', () => this.changeCount(-1));
        $('count-up').addEventListener('click', () => this.changeCount(1));
        $('level').addEventListener('click', event => {
            const button = event.target.closest('button[data-level]');
            if (!button) return;
            this.settings.level = button.dataset.level;
            saveSettings(this.settings);
            this.renderTitle();
        });
        $('start').addEventListener('click', () => this.start());
        $('resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startWith(saved);
        });
        $('open-help-title').addEventListener('click', () => this.openDialog('help'));
    }

    changeCount(delta) {
        this.settings.count = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, this.settings.count + delta));
        saveSettings(this.settings);
        this.renderTitle();
    }

    renderTitle() {
        $('count-value').textContent = `${this.settings.count}人`;
        $('count-down').disabled = this.settings.count <= MIN_PLAYERS;
        $('count-up').disabled = this.settings.count >= MAX_PLAYERS;
        $('level').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.level === this.settings.level));
        $('resume').hidden = !loadSavedGame();
    }

    showTitle() {
        this.controller?.stop();
        this.controller = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('screen-game').hidden = true;
        this.renderTitle();
        $('screen-title').hidden = false;
    }

    start() {
        clearSavedGame();
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.slice(0, this.settings.count - 1).map(name => ({ name, isCPU: true }))];
        this.startWith({ players, options: { level: this.settings.level } });
    }

    startWith(setup) {
        this.controller?.stop();
        this.selected = null;
        this.resultShown = false;
        this.controller = new LocalGameController(setup, {
            onUpdate: () => this.render(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            }
        });
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は鳴らさない
        this.view = null;
        this.hintCommand = null;
        $('screen-title').hidden = true;
        $('screen-game').hidden = false;
        this.render();
        this.controller.scheduleCpu();
    }

    // ---- ゲーム ----

    bindGame() {
        $('home').addEventListener('click', () => this.showTitle());
        $('open-help-game').addEventListener('click', () => this.openDialog('help'));
        $('open-log').addEventListener('click', () => this.showLog());
        $('hint').addEventListener('click', () => this.showHint());
        $('players').addEventListener('click', () => this.showLog());
        $('map').addEventListener('click', event => this.tapMap(event));
        $('market').addEventListener('click', event => {
            const b = event.target.closest('[data-slot]');
            if (b && !b.disabled) this.draw(Number(b.dataset.slot));
        });
        $('hand').addEventListener('click', event => {
            if (event.target.closest('#open-tickets')) this.showTickets();
        });
        $('actions').addEventListener('click', event => {
            const b = event.target.closest('button');
            if (!b || b.disabled) return;
            if (b.dataset.pay !== undefined) {
                this.payIndex = Number(b.dataset.pay);
                music.play('select');
                return this.render();
            }
            if (b.id === 'claim') return this.claim();
            if (b.id === 'cancel') {
                music.play('cancel');
                this.selected = null;
                return this.render();
            }
            if (b.id === 'draw-tickets') return this.send({ type: 'tickets' });
            if (b.id === 'pass') return this.send({ type: 'pass' });
        });
        $('choose-list').addEventListener('click', event => {
            const b = event.target.closest('[data-ticket]');
            if (!b) return;
            const id = Number(b.dataset.ticket);
            if (this.picked.has(id)) this.picked.delete(id);
            else this.picked.add(id);
            music.play(this.picked.has(id) ? 'select' : 'cancel');
            this.renderChoose();
        });
        $('choose-ok').addEventListener('click', () => {
            if (this.send({ type: 'keep', tickets: [...this.picked] })) $('choose').close();
        });
        // 目的地を選ぶダイアログは、選ぶまで閉じない
        $('choose').addEventListener('cancel', event => event.preventDefault());
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('.close').forEach(b => b.addEventListener('click', () => dialog.close()));
            dialog.addEventListener('click', event => {
                if (event.target === dialog && !['result', 'choose'].includes(dialog.id)) dialog.close();
            });
        });
        $('again').addEventListener('click', () => {
            $('result').close();
            this.start();
        });
        $('result-home').addEventListener('click', () => this.showTitle());
    }

    openDialog(id) {
        const dialog = $(id);
        if (!dialog.open) dialog.showModal();
        dialog.querySelector('.help-body, .ticket-list, .log-list, .table-wrap')?.scrollTo?.(0, 0);
    }

    me() {
        return this.view.players[this.view.you];
    }

    myTurn() {
        return this.view.phase === 'play' && this.view.actors.includes(this.view.you) && !this.me().offered;
    }

    // 地図を押した位置に一番近い、まだ引かれていない路線を選ぶ
    tapMap(event) {
        if (!this.view || this.view.phase !== 'play') return;
        const svg = $('map').querySelector('svg');
        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const p = point.matrixTransform(svg.getScreenCTM().inverse());
        const id = nearestRoute(p.x, p.y, r => this.view.claimed[r.id] === null);
        if (id === null) {
            if (this.selected !== null) music.play('cancel');
            this.selected = null;
            return this.render();
        }
        this.selected = this.selected === id ? null : id;
        this.payIndex = 0;
        music.play(this.selected === null ? 'cancel' : 'select');
        this.render();
    }

    draw(slot) {
        if (!this.myTurn()) return;
        this.selected = null;
        this.send({ type: 'draw', slot });
    }

    claim() {
        const options = this.payOptions();
        const pay = options[this.payIndex] ?? options[0];
        if (!pay) return;
        if (this.send({ type: 'claim', route: this.selected, color: pay.color, locos: pay.locos })) this.selected = null;
        this.render();
    }

    // 選んだ路線の払い方
    payOptions() {
        if (this.selected === null) return [];
        return paymentOptions(this.me().hand, ROUTES[this.selected]);
    }

    send(command) {
        if (!this.controller) return false;
        return this.controller.send(command);
    }

    // ---- 描画 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const prev = this.view;
        this.view = view;
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        if (prev) this.playSound(fresh, prev);
        if (fresh.length > 0) this.hintCommand = null;
        const me = this.me();
        if (this.selected !== null && view.claimed[this.selected] !== null) this.selected = null;
        this.renderPlayers(view);
        this.renderMap(view, me);
        this.renderMarket(view, me);
        this.renderHand(me);
        this.renderActions(view, me);
        this.markHint();
        if (!me.offered && $('choose').open) $('choose').close();
        if (me.offered && !$('choose').open) {
            this.picked = new Set(me.offered);
            this.renderChoose();
            this.openDialog('choose');
        }
        if (view.phase === 'end' && !this.resultShown) {
            this.resultShown = true;
            setTimeout(() => this.showResult(), 700);
        }
    }

    // 新しい出来事から効果音を1つ鳴らす。自分の手はその音、自分の番になったら turn、終わりは勝ち負け
    // CPU は1手ずつ速く打つので、CPU の手ごとには鳴らさない
    playSound(fresh, prev) {
        const view = this.view;
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winners.includes(view.you) ? 'win' : 'lose');
        const mine = fresh.filter(e => e.seat === view.you).map(e => e.type);
        if (mine.includes('claim')) return music.play('place');
        if (mine.includes('draw') || mine.includes('tickets')) return music.play('draw');
        if (mine.includes('keep')) return music.play('select');
        const myTurn = v => v.phase === 'play' && v.actors.includes(v.you);
        if (myTurn(view) && !myTurn(prev)) music.play('turn');
    }

    // ---- ヒント ----

    showHint() {
        const command = this.view ? suggest(this.view) : null;
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.hintCommand = command;
        if (command.type === 'claim') {
            // 引く路線を選び、払い方もおすすめに合わせる（「引く」で決められる）
            this.selected = command.route;
            this.payIndex = Math.max(0, this.payOptions().findIndex(p => p.color === command.color && p.locos === command.locos));
        }
        if (command.type === 'keep') {
            this.picked = new Set(command.tickets);
            this.renderChoose();
        }
        this.render();
        const text = { claim: '光っている路線を引く', draw: '印の付いたカードを引く', tickets: '目的地のカードを引く', pass: '見送る', keep: '選んだ目的地を残す' }[command.type];
        this.toast(`おすすめ：${text}`);
    }

    // おすすめの手のボタンに印を付ける
    markHint() {
        // ダイアログのボタンは描き直さないので、前の印を外してから付ける
        document.querySelectorAll('.recommended').forEach(el => el.classList.remove('recommended'));
        const c = this.hintCommand;
        if (!c) return;
        const selector = { claim: '#claim', draw: `[data-slot="${c.slot}"]`, tickets: '#draw-tickets', pass: '#pass', keep: '#choose-ok' }[c.type];
        document.querySelectorAll(selector).forEach(el => el.classList.add('recommended'));
    }

    renderPlayers(view) {
        // 4人以上は幅が足りないので、名前を省いて点と両数だけ
        const many = view.players.length >= 4;
        $('players').innerHTML = view.players.map(p => {
            const turn = view.phase === 'play' && view.current === p.id;
            return `<span class="pl${turn ? ' turn' : ''}${p.id === view.you ? ' self' : ''}" style="--pc:${PLAYER_COLORS[p.id]}">
                ${many
        ? `<span class="pl-top"><i class="pl-dot"></i><span class="pl-num">${p.points}<small>点</small></span></span><span class="pl-num">${p.trains}<small>両</small></span>`
        : `<span class="pl-top"><i class="pl-dot"></i><b class="pl-name">${escapeHtml(p.name)}</b></span><span class="pl-num">${p.trains}<small>両</small> ${p.points}<small>点</small></span>`}</span>`;
        }).join('');
    }

    renderMap(view, me) {
        const blocked = new Set(ROUTES.filter(r => view.claimed[r.id] === null
            && routeBlockReason(view.claimed, view.players.length, me.id, Infinity, r.id)).map(r => r.id));
        const ticketCities = new Map();
        (me.tickets ?? []).forEach(id => {
            const t = TICKETS[id];
            const mark = connected(me.routes, t.a, t.b) ? 'done' : 'todo';
            [t.a, t.b].forEach(c => { if (ticketCities.get(c) !== 'todo') ticketCities.set(c, mark); });
        });
        $('map').innerHTML = mapSvg({ claimed: view.claimed, blocked, selected: this.selected, ticketCities });
    }

    renderMarket(view, me) {
        const can = this.myTurn();
        const cards = view.faceUp.map((card, slot) => {
            if (card === null || card === undefined) return '<span class="mk-card empty"></span>';
            const off = !can || (card === LOCO && view.drewOne);
            return `<button class="mk-card" data-slot="${slot}" ${off ? 'disabled' : ''} aria-label="表の${COLOR_NAMES[card]}">${cardSvg(card)}</button>`;
        }).join('');
        const deckLeft = view.deckCount + view.discardCount;
        const deck = `<button class="mk-deck" data-slot="${DECK_SLOT}" ${!can || deckLeft === 0 ? 'disabled' : ''} aria-label="山から引く">
            <span class="deck-back"></span><span class="mk-count">${view.deckCount}</span></button>`;
        $('market').innerHTML = cards + deck;
    }

    renderHand(me) {
        const hand = HAND_ORDER.map(c => `<span class="hd${me.hand[c] ? '' : ' none'}" title="${COLOR_NAMES[c]}">${cardSvg(c)}<b>${me.hand[c]}</b></span>`).join('');
        const done = (me.tickets ?? []).filter(id => connected(me.routes, TICKETS[id].a, TICKETS[id].b)).length;
        $('hand').innerHTML = `${hand}<button id="open-tickets" class="tk-btn" aria-label="目的地">${LINE_ICONS.ticket}<span>${done}/${me.ticketCount}</span></button>`;
    }

    renderActions(view, me) {
        let prompt = '';
        let bad = false;
        let actions = '';
        const current = view.players[view.current];
        if (view.phase === 'end') prompt = 'ゲーム終了';
        else if (view.phase === 'choose') prompt = me.offered ? '目的地を選んでください' : 'ほかの人が目的地を選んでいます';
        else if (!this.myTurn()) {
            const last = view.logs.at(-1);
            prompt = last && !last.head ? last.text : `${current.name}の番です`;
        } else if (this.selected !== null) {
            const r = ROUTES[this.selected];
            const block = routeBlockReason(view.claimed, view.players.length, me.id, me.trains, r.id);
            const options = this.payOptions();
            prompt = `${routeName(r)}（${COLOR_NAMES[r.color]}${r.len}両・${ROUTE_POINTS[r.len]}点）`;
            if (view.drewOne) {
                prompt += '：カードをもう1枚引きます';
                bad = true;
            } else if (block) {
                prompt += `：${block}`;
                bad = true;
            } else if (options.length === 0) {
                prompt += '：カードが足りません';
                bad = true;
            } else {
                if (this.payIndex >= options.length) this.payIndex = 0;
                actions = options.map((o, i) => `<button class="pay${i === this.payIndex ? ' on' : ''}" data-pay="${i}" aria-label="${o.color === LOCO ? '機関車' : COLOR_NAMES[o.color]}で払う">
                    ${o.color === LOCO ? '' : `${cardSvg(o.color)}<b>${r.len - o.locos}</b>`}${o.locos ? `${cardSvg(LOCO)}<b>${o.locos}</b>` : ''}</button>`).join('')
                    + '<button id="claim" class="btn primary small">引く</button>';
            }
            actions = actions || '<button id="cancel" class="btn secondary small">やめる</button>';
        } else if (view.drewOne) {
            prompt = 'もう1枚引いてください（表の機関車は取れません）';
        } else {
            prompt = view.lastPlayer !== null ? '最後の1周です。カードを引くか、地図の路線を押してください' : 'カードを引くか、地図の路線を押してください';
            actions = `<button id="draw-tickets" class="btn secondary small" ${view.ticketDeckCount === 0 ? 'disabled' : ''}>目的地を引く（残り${view.ticketDeckCount}）</button>`;
            // 引くカードも目的地も、引ける路線もなければ、見送る
            if (view.deckCount + view.discardCount === 0 && view.faceUp.every(c => c === null) && view.ticketDeckCount === 0
                && !ROUTES.some(r => !routeBlockReason(view.claimed, view.players.length, me.id, me.trains, r.id) && paymentOptions(me.hand, r).length)) {
                actions = '<button id="pass" class="btn secondary small">見送る</button>';
            }
        }
        $('prompt').textContent = prompt;
        $('prompt').classList.toggle('bad', bad);
        $('actions').innerHTML = actions;
    }

    renderChoose() {
        const me = this.me();
        const min = this.view.phase === 'choose' ? 2 : 1;
        $('choose-title').textContent = `目的地を${Math.min(min, me.offered.length)}枚以上残す`;
        $('choose-list').innerHTML = me.offered.map(id => {
            const t = TICKETS[id];
            return `<button class="ticket${this.picked.has(id) ? ' on' : ''}" data-ticket="${id}"><span class="tk-name">${ticketName(t)}</span><b class="tk-pts">${t.points}</b></button>`;
        }).join('');
        $('choose-ok').disabled = this.picked.size < Math.min(min, me.offered.length);
    }

    showTickets() {
        const me = this.me();
        $('tickets-list').innerHTML = (me.tickets ?? []).map(id => {
            const t = TICKETS[id];
            const done = connected(me.routes, t.a, t.b);
            return `<div class="ticket${done ? ' done' : ''}"><span class="tk-name">${ticketName(t)}</span><b class="tk-pts">${done ? '✓ ' : ''}${t.points}</b></div>`;
        }).join('') || '<p class="dialog-text">目的地はまだありません</p>';
        this.openDialog('tickets-dialog');
    }

    showLog() {
        const view = this.controller.getView();
        $('log-list').innerHTML = view.logs.slice().reverse().map(l => `<p class="${l.head ? 'head' : ''}">${escapeHtml(l.text)}</p>`).join('');
        this.openDialog('log-dialog');
    }

    showResult() {
        const view = this.controller?.getView();
        if (!view || view.phase !== 'end') return;
        const won = view.winners.includes(view.you);
        $('result-title').textContent = won ? 'あなたの勝ち！' : 'あなたの負け';
        const ranked = [...view.players].sort((a, b) => b.score.total - a.score.total);
        $('result-table').innerHTML = ranked.map(p => {
            const s = p.score;
            return `<tr class="${view.winners.includes(p.id) ? 'win' : ''}${p.id === view.you ? ' self' : ''}">
                <td class="name"><i class="pl-dot" style="--pc:${PLAYER_COLORS[p.id]}"></i>${escapeHtml(p.name)}</td><td class="total">${s.total}</td>
                <td class="parts"><span class="sp">路線<b>${s.routes}</b></span><span class="sp">目的地<b>+${s.ticketPlus}</b></span><span class="sp minus">未達<b>${s.ticketMinus ? '−' : ''}${s.ticketMinus}</b></span><span class="sp">最長<b>${s.bonus}</b></span></td></tr>`;
        }).join('');
        this.openDialog('result');
    }

    toast(message) {
        const el = $('toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
    }
}
