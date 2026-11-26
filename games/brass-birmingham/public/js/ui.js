/**
 * 画面（タイトル・ゲーム・ボード・ログ・最後の結果・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * 選べる手は、ルールの関数（buildOptions など）をビューの state に当てて求める
 * アクションは「アクションを選ぶ → 地図か一覧で対象を選ぶ → 捨てるカードを確かめて決める」の順に進める
 */

import {
    MIN_PLAYERS, MAX_PLAYERS, INDUSTRIES, INDUSTRY_ORDER, LINK_BY_ID, PLAYER_COLORS, tileDef, placeName,
    COAL_MARKET_SIZE, IRON_MARKET_SIZE
} from './data.js';
import {
    buildOptions, networkOptions, sellOptions, developOptions, canLoan, canScout, trial, roundsPerEra, buyPrice,
    nextLevel, slotLoc, eraPoints, incomeLevel
} from './rules.js';
import { LEVELS, suggestDiscard } from './cpu-player.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import MapView from './map-view.js';
import { industryBadge } from './art.js';
import { music } from './music.js';

const SETTINGS_KEY = 'brass-birmingham.settings';
const CPU_NAMES = ['ワット', 'ボールトン', 'ダーウィン'];
const ACTIONS = [
    ['build', '建てる'], ['network', 'ネットワーク'], ['sell', '売る'], ['develop', '開発'],
    ['loan', '借りる'], ['scout', '偵察'], ['pass', 'パス']
];

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const linkName = (id) => LINK_BY_ID[id].ends.map(placeName).join('–');
const eraName = (era) => (era === 'canal' ? '運河' : '鉄道');

function loadSettings() {
    const fallback = { count: 3, level: 'normal' };
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

// カードの表示
function cardLabel(card) {
    if (card.kind === 'loc') return { title: placeName(card.loc), sub: '場所', cls: 'loc' };
    if (card.kind === 'ind') return { title: card.industries.map(i => INDUSTRIES[i].name).join('・'), sub: '産業', cls: 'ind', badges: card.industries };
    if (card.kind === 'wildLoc') return { title: 'どの町でも', sub: 'ワイルド', cls: 'wild' };
    return { title: 'どの産業でも', sub: 'ワイルド', cls: 'wild' };
}

// 試した前後の差（払ったお金）
const costOf = (state, seat, after) => state.players[seat].money - after.players[seat].money;
const moneyText = (n) => (n > 0 ? `£${n}` : n < 0 ? `+£${-n}` : '£0');

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.mode = null;
        this.options = null;
        this.optionsKey = null;
        this.lastSeq = 0;
        this.lastEra = null;
        this.map = new MapView($('#map'), { onPick: (kind, id) => this.onMapPick(kind, id) });
        this.bindStatic();
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.stopGame();
        $('#screen-game').hidden = true;
        $('#screen-title').hidden = false;
        $('#resume').hidden = !loadSavedGame();
        this.renderSetup();
    }

    startGame(setup) {
        this.stopGame();
        try {
            this.controller = new LocalGameController(setup, {
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
        this.mode = null;
        this.view = this.controller.getView();
        this.lastSeq = this.view.logs.at(-1)?.seq ?? 0;
        this.soundSeq = this.lastSeq;
        this.soundOver = this.view.over;
        this.lastEra = this.view.state.era;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.map.setup(this.view.state);
        this.map.resize();
        this.map.resetZoom();
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        const { count, level } = this.settings;
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true }))];
        this.startGame({ players, options: {}, level });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        ['#result', '#mat', '#log'].forEach(id => { if ($(id).open) $(id).close(); });
    }

    onUpdate() {
        if (!this.controller) return;
        this.view = this.controller.getView();
        const state = this.view.state;
        this.playSounds(this.view, state.era !== this.lastEra);
        if (state.era !== this.lastEra) {
            this.lastEra = state.era;
            const score = state.scores.at(-1);
            if (score) this.toast(`運河の時代の得点：${score.points.map((p, s) => `${state.players[s].name} +${p.links + p.tiles}`).join('・')}`, 3600);
        }
        if (this.view.current !== this.view.seat) this.mode = null;
        this.render();
        if (this.view.over) setTimeout(() => this.showResult(), 700);
    }

    // 効果音：前の更新からの記録を見て、1回の更新に1つだけ鳴らす
    // 終局は勝ち・負け、時代の得点は知らせ、自分の手は置いた音、ほかの人の手のあとは自分の番か知らせ
    playSounds(view, eraChanged) {
        const fresh = view.logs.filter(l => l.seq > this.soundSeq);
        this.soundSeq = view.logs.at(-1)?.seq ?? this.soundSeq;
        if (view.over && !this.soundOver) {
            this.soundOver = true;
            return music.play(view.results.find(r => r.seat === view.seat)?.rank === 1 ? 'win' : 'lose');
        }
        if (eraChanged) return music.play('notify');
        const acts = fresh.filter(l => l.seat !== null && l.seat !== undefined);
        if (!acts.length) return;
        if (acts.every(l => l.seat === view.seat)) return music.play('place');
        music.play(view.current === view.seat ? 'turn' : 'notify');
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
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => this.newGame());
        $('#result-home').addEventListener('click', () => this.showTitle());
        $('#home').addEventListener('click', () => this.showTitle());
        $('#hint').addEventListener('click', () => this.showHint());
        $('#open-help-title').addEventListener('click', () => this.openDialog('#help'));
        $('#open-help-game').addEventListener('click', () => this.openDialog('#help'));
        $('#open-log').addEventListener('click', () => this.showLog());
        $('#zoom-in').addEventListener('click', () => this.map.zoomBy(1.6));
        $('#zoom-out').addEventListener('click', () => this.map.zoomBy(1 / 1.6));
        $('#zoom-fit').addEventListener('click', () => this.map.resetZoom());
        document.querySelectorAll('dialog .close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
        document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', (event) => {
            if (event.target === dialog && dialog.id !== 'result') dialog.close();
        }));
        $('#players').addEventListener('click', (event) => {
            const chip = event.target.closest('[data-seat]');
            if (chip) this.showMat(Number(chip.dataset.seat));
        });
        $('#hand').addEventListener('click', (event) => {
            const card = event.target.closest('[data-card]');
            if (card) this.onCardTap(card.dataset.card);
        });
        $('#work').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (button) this.onWorkButton(button.dataset.act, button.dataset.arg ?? null, button.dataset.arg2 ?? null);
        });
    }

    openDialog(selector) {
        const dialog = $(selector);
        if (!dialog.open) dialog.showModal();
        dialog.querySelector('.help-body, .mat-body, .log-list')?.scrollTo(0, 0);
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
        $('#count').innerHTML = counts.map(n =>
            `<button data-count="${n}" role="radio" aria-checked="${n === count}" class="${n === count ? 'on' : ''}">${n}人</button>`).join('');
        $('#level').innerHTML = Object.entries(LEVELS).map(([key, name]) =>
            `<button data-level="${key}" role="radio" aria-checked="${key === level}" class="${key === level ? 'on' : ''}">${name}</button>`).join('');
    }

    // ヒント：CPU（ふつう）が選ぶ行動のボタンに印を付け、行き先を文で出す
    showHint() {
        const command = this.controller?.hint();
        if (!command) return this.toast('自分の番になったら、おすすめを出せます');
        if (this.mode) {
            this.mode = null;
            this.render();
        }
        document.querySelector(`[data-act="mode"][data-arg="${command.type}"]`)?.classList.add('recommended');
        const name = ACTIONS.find(([type]) => type === command.type)?.[1] ?? command.type;
        let detail = '';
        if (command.type === 'build') detail = `：${placeName(slotLoc(command.slot))}に${INDUSTRIES[command.industry].name}`;
        if (command.type === 'network') detail = `：${command.links.map(linkName).join('、')}`;
        if (command.type === 'sell') detail = `：${command.sales.map(s => placeName(slotLoc(s.slot))).join('、')}`;
        if (command.type === 'develop') detail = `：${command.industries.map(i => INDUSTRIES[i].name).join('、')}`;
        this.toast(`おすすめ：${name}${detail}`, 4000);
    }

    toast(message, ms = 2400) {
        const toast = $('#toast');
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.remove('show'), ms);
    }

    // ---- 描画 ----

    get myTurn() {
        return !!this.view && !this.view.over && this.view.current === this.view.seat;
    }

    render() {
        const { state } = this.view;
        this.renderTop(state);
        this.renderPlayers(state);
        this.ensureOptions();
        this.renderMap(state);
        this.renderStatus(state);
        this.renderWork(state);
        this.renderHand(state);
    }

    renderTop(state) {
        const per = roundsPerEra(state.numPlayers);
        $('#era-info').innerHTML = `<b>${eraName(state.era)}の時代</b><span>${Math.min(state.round, per)}/${per}・山札${state.deckCount}</span>`;
        const coal = buyPrice(state.coalMarket, COAL_MARKET_SIZE);
        const iron = buyPrice(state.ironMarket, IRON_MARKET_SIZE);
        $('#market-info').innerHTML =
            `<span class="mk coal" title="石炭の市場">石炭 <b>£${coal}</b><small>${state.coalMarket}</small></span>` +
            `<span class="mk iron" title="鉄の市場">鉄 <b>£${iron}</b><small>${state.ironMarket}</small></span>`;
    }

    renderPlayers(state) {
        const current = this.view.current;
        $('#players').classList.toggle('many', state.numPlayers >= 4);
        $('#players').innerHTML = state.order.map(seat => {
            const p = state.players[seat];
            const me = seat === this.view.seat;
            return `<button class="pchip ${seat === current ? 'turn' : ''} ${me ? 'me' : ''}" data-seat="${seat}" style="--pc:${PLAYER_COLORS[seat]}">
                <span class="pname"><i class="dot"></i>${escapeHtml(p.name)}</span>
                <span class="pstats"><b>${p.vp}</b><small class="unit">点</small> £${p.money} <span class="inc ${p.income < 0 ? 'neg' : ''}">${p.income >= 0 ? '+' : '−'}${Math.abs(p.income)}</span></span>
            </button>`;
        }).join('');
    }

    // 自分の番なら、選べる手を一度だけ求めておく
    ensureOptions() {
        if (!this.myTurn) {
            this.options = null;
            this.optionsKey = null;
            return;
        }
        const key = this.view.state.players[this.view.seat].hand.map(c => c.id).join() + JSON.stringify(this.view.state.board) + JSON.stringify(this.view.state.links) + this.view.state.actionsLeft;
        if (key === this.optionsKey) return;
        this.optionsKey = key;
        const { state, seat } = this.view;
        this.options = {
            build: buildOptions(state, seat),
            network: networkOptions(state, seat),
            sell: sellOptions(state, seat),
            develop: developOptions(state, seat),
            loan: canLoan(state, seat),
            scout: canScout(state, seat)
        };
    }

    renderMap(state) {
        const last = [...this.view.logs].reverse().find(l => l.marks);
        const marks = last ? last.marks : null;
        const { pick, selected } = this.mapPicks();
        this.map.render(state, { marks, pick, selected });
    }

    mapPicks() {
        const m = this.mode;
        if (!m || !this.options) return { pick: null, selected: null };
        if (m.type === 'build') {
            const slots = m.slot ? [m.slot] : [...new Set(this.options.build.map(o => o.slot))];
            return { pick: { slots }, selected: { slots: m.slot ? [m.slot] : [] } };
        }
        if (m.type === 'network') {
            return { pick: { links: m.links.length === 0 || m.second ? this.networkChoices().map(o => o.id) : [] }, selected: { links: m.links } };
        }
        if (m.type === 'sell') {
            const slots = m.pending ? [m.pending] : [...new Set(this.sellChoices().map(o => o.slot))];
            return { pick: { slots }, selected: { slots: [...m.sales.map(s => s.slot), ...(m.pending ? [m.pending] : [])] } };
        }
        return { pick: null, selected: null };
    }

    renderStatus(state) {
        const status = $('#status');
        if (this.view.over) {
            status.innerHTML = '<b>ゲーム終了</b>';
            return;
        }
        const seat = this.view.current;
        const p = state.players[seat];
        if (this.myTurn) {
            const total = state.era === 'canal' && state.round === 1 ? 1 : 2;
            status.innerHTML = `<b class="you">あなたの番</b><span>アクション ${total - state.actionsLeft + 1}/${total}</span>`;
        } else {
            status.innerHTML = `<b style="color:${PLAYER_COLORS[seat]}">${escapeHtml(p.name)}</b><span>の番…</span>`;
        }
    }

    renderWork(state) {
        const work = $('#work');
        if (!this.myTurn) {
            const logs = this.view.logs.filter(l => l.text).slice(-4);
            work.innerHTML = `<ul class="mini-log">${logs.map(l => this.logLine(l, state)).join('')}</ul>`;
            work.closest('.panel').classList.remove('choosing', 'listing');
            return;
        }
        // 選んでいる間はパネルを高くし、一覧があるときは手札を1行にする
        work.closest('.panel').classList.toggle('choosing', !!this.mode);
        if (!this.mode) {
            const o = this.options;
            const available = { build: o.build.length > 0, network: o.network.length > 0, sell: o.sell.length > 0, develop: o.develop.length > 0, loan: o.loan, scout: o.scout, pass: true };
            work.innerHTML = `<div class="action-grid">${ACTIONS.map(([type, name]) =>
                `<button class="act-btn ${type}" data-act="mode" data-arg="${type}" ${available[type] ? '' : 'disabled'}>${name}</button>`).join('')}</div>`;
            return;
        }
        work.innerHTML = this.modeHtml(state);
        work.closest('.panel').classList.toggle('listing', !!work.querySelector('.item-list'));
    }

    logLine(l, state) {
        const who = l.seat === null || l.seat === undefined ? '' : `<b style="color:${PLAYER_COLORS[l.seat]}">${escapeHtml(state.players[l.seat].name)}</b> `;
        return `<li>${who}${escapeHtml(l.text)}</li>`;
    }

    renderHand(state) {
        const me = state.players[this.view.seat];
        const eligible = this.eligibleCards();
        const chosen = new Set(this.chosenCards());
        $('#hand').innerHTML = me.hand.map(card => {
            const label = cardLabel(card);
            const can = eligible ? eligible.includes(card.id) : false;
            const badges = label.badges ? label.badges.map(industryBadge).join('') : '';
            return `<button class="card ${label.cls} ${can ? 'can' : ''} ${chosen.has(card.id) ? 'chosen' : ''} ${eligible && !can ? 'dim' : ''}" data-card="${card.id}">
                <span class="card-sub">${badges}${label.sub}</span><span class="card-title">${escapeHtml(label.title)}</span></button>`;
        }).join('') + (me.hand.length === 0 ? '<p class="muted empty-hand">手札はありません</p>' : '');
    }

    // ---- アクションの組み立て ----

    // 今のモードで捨てられるカード（null なら選べない）
    eligibleCards() {
        const m = this.mode;
        if (!m || !this.myTurn) return null;
        const hand = this.view.state.players[this.view.seat].hand.map(c => c.id);
        if (m.type === 'build') return m.industry ? this.buildOption()?.cards ?? [] : null;
        if (m.type === 'scout') return hand;
        if (m.type === 'network' && m.links.length === 0) return null;
        if (m.type === 'sell' && m.sales.length === 0) return null;
        if (m.type === 'develop' && m.industries.length === 0) return null;
        return hand;
    }

    chosenCards() {
        const m = this.mode;
        if (!m) return [];
        if (m.type === 'scout') return m.cards;
        return m.card ? [m.card] : [];
    }

    buildOption() {
        const m = this.mode;
        return this.options.build.find(o => o.slot === m.slot && o.industry === m.industry) ?? null;
    }

    networkChoices() {
        const m = this.mode;
        const { state, seat } = this.view;
        if (m.links.length === 0) return this.options.network;
        if (m.links.length === 1 && state.era === 'rail') {
            m.secondOptions ??= networkOptions(state, seat, m.links[0]);
            return m.secondOptions;
        }
        return [];
    }

    sellChoices() {
        const m = this.mode;
        const { state, seat } = this.view;
        m.choicesFor ??= {};
        const key = JSON.stringify(m.sales);
        m.choicesFor[key] ??= m.sales.length === 0 ? this.options.sell : sellOptions(state, seat, m.sales);
        return m.choicesFor[key];
    }

    developChoices() {
        const m = this.mode;
        const { state, seat } = this.view;
        if (m.industries.length === 0) return this.options.develop;
        if (m.industries.length === 1) {
            m.secondOptions ??= developOptions(state, seat, m.industries[0]);
            return m.secondOptions;
        }
        return [];
    }

    defaultCard(ids = null) {
        return suggestDiscard(this.view.state, this.view.seat, ids);
    }

    commandOf() {
        const m = this.mode;
        if (!m) return null;
        if (m.type === 'build') return m.industry && m.card ? { type: 'build', card: m.card, slot: m.slot, industry: m.industry } : null;
        if (m.type === 'network') return m.links.length > 0 && m.card ? { type: 'network', card: m.card, links: m.links } : null;
        if (m.type === 'sell') return m.sales.length > 0 && m.card ? { type: 'sell', card: m.card, sales: m.sales } : null;
        if (m.type === 'develop') return m.industries.length > 0 && m.card ? { type: 'develop', card: m.card, industries: m.industries } : null;
        if (m.type === 'scout') return m.cards.length === 3 ? { type: 'scout', cards: m.cards } : null;
        return m.card ? { type: m.type, card: m.card } : null;
    }

    // 決める前の見込み（払うお金など）
    previewText(command) {
        if (!command) return '';
        const { state, seat } = this.view;
        const t = trial(state, seat, command);
        if (!t.ok) return `<span class="bad">${escapeHtml(t.error)}</span>`;
        const cost = costOf(state, seat, t.state);
        const parts = [];
        if (command.type === 'loan') parts.push('£30 もらい、収入 −3');
        else parts.push(`支払い ${moneyText(cost)}`);
        const p0 = state.players[seat];
        const p1 = t.state.players[seat];
        if (p1.vp !== p0.vp) parts.push(`得点 +${p1.vp - p0.vp}`);
        const inc = incomeLevel(p1.incomeSpace) - incomeLevel(p0.incomeSpace);
        if (inc !== 0 && command.type !== 'loan') parts.push(`収入 ${inc > 0 ? '+' : ''}${inc}`);
        return parts.join('・');
    }

    modeHtml(state) {
        const m = this.mode;
        const command = this.commandOf();
        const title = ACTIONS.find(a => a[0] === m.type)[1];
        let prompt = '';
        let list = '';
        if (m.type === 'build') {
            if (!m.slot) {
                prompt = '建てる場所を、地図か一覧から選んでください';
                list = this.options.build.map(o => this.buildItem(o, state)).join('');
            } else if (!m.industry) {
                prompt = `${placeName(slotLoc(m.slot))}に建てる産業を選んでください`;
                list = this.options.build.filter(o => o.slot === m.slot).map(o => this.buildItem(o, state)).join('');
            } else {
                prompt = `${placeName(slotLoc(m.slot))}に ${INDUSTRIES[m.industry].name} Lv${nextLevel(state.players[this.view.seat], m.industry)}`;
            }
        } else if (m.type === 'network') {
            const choices = this.networkChoices();
            if (m.links.length === 0) prompt = `${state.era === 'canal' ? '運河（£3）' : '鉄道（£5＋石炭1）'}を引くところを選んでください`;
            else prompt = `${m.links.map(linkName).join('、')}`;
            if (m.links.length === 1 && state.era === 'rail' && !m.second && choices.length > 0) {
                list = '<button class="item add" data-act="second">2本目も引く（合わせて £15＋石炭2＋ビール1）</button>';
            }
            if (m.links.length === 0 || m.second) {
                list += choices.map(o => `<button class="item" data-act="link" data-arg="${o.id}">${escapeHtml(linkName(o.id))}<small>${moneyText(costOf(state, this.view.seat, o.after))}</small></button>`).join('');
            }
        } else if (m.type === 'sell') {
            const choices = this.sellChoices();
            const done = m.sales.map(s => `${placeName(slotLoc(s.slot))}の${INDUSTRIES[state.board[s.slot].industry].name}→${placeName(slotLoc(s.merchant))}`);
            prompt = done.length > 0 ? `売る：${done.join('、')}` : '売るタイルを、地図か一覧から選んでください';
            const shown = m.pending ? choices.filter(o => o.slot === m.pending) : choices;
            list = shown.map(o => {
                const tile = state.board[o.slot];
                const mer = state.merchants[o.merchant];
                const bonus = mer.beer > 0 ? `<small>ビールでおまけ</small>` : '';
                return `<button class="item" data-act="sale" data-arg="${o.slot}" data-arg2="${o.merchant}">${industryBadge(tile.industry)}${escapeHtml(placeName(slotLoc(o.slot)))} → ${escapeHtml(placeName(slotLoc(o.merchant)))}${bonus}</button>`;
            }).join('');
            if (m.sales.length > 0 && choices.length > 0 && !m.pending) prompt += '（続けて売れます）';
        } else if (m.type === 'develop') {
            const choices = this.developChoices();
            prompt = m.industries.length > 0 ? `外す：${m.industries.map(i => INDUSTRIES[i].name).join('・')}` : '外すタイルの産業を選んでください（鉄1つずつ）';
            const me = state.players[this.view.seat];
            if (m.industries.length < 2) {
                list = choices.map(o => {
                    // 2枚目が1枚目と同じ産業なら、その次のレベルを外す
                    const lv = m.industries.length === 1 && m.industries[0] === o.industry
                        ? nextLevel(me, o.industry) + 1 : nextLevel(me, o.industry);
                    return `<button class="item" data-act="develop" data-arg="${o.industry}">${industryBadge(o.industry)}${INDUSTRIES[o.industry].name} Lv${lv} を外す<small>${moneyText(costOf(state, this.view.seat, o.after))}</small></button>`;
                }).join('');
            }
        } else if (m.type === 'loan') {
            prompt = '£30 借ります（収入が3つ下がります）';
        } else if (m.type === 'scout') {
            prompt = `捨てる手札を3枚選んでください（${m.cards.length}/3）`;
        } else if (m.type === 'pass') {
            prompt = '手札を1枚捨てて、アクションを終えます';
        }
        const needCard = this.eligibleCards() !== null && m.type !== 'scout';
        const cardNote = needCard ? (m.card ? '<span class="muted">捨てるカード：下の手札で選び直せます</span>' : '<span class="muted">捨てるカードを下の手札から選んでください</span>') : '';
        return `<div class="mode-head"><b>${title}</b><span class="prompt">${escapeHtml(prompt).replace(/&lt;(\/?)(small)&gt;/g, '<$1$2>')}</span></div>
            ${list ? `<div class="item-list">${list}</div>` : ''}
            <div class="mode-foot">
                <span class="preview">${command ? this.previewText(command) : cardNote}</span>
                <button class="btn secondary small" data-act="cancel">やめる</button>
                <button class="btn primary small" data-act="confirm" ${command ? '' : 'disabled'}>決める</button>
            </div>`;
    }

    buildItem(o, state) {
        const seat = this.view.seat;
        const lv = nextLevel(state.players[seat], o.industry);
        const td = tileDef(o.industry, lv);
        const res = [td.coal ? `石炭${td.coal}` : '', td.iron ? `鉄${td.iron}` : ''].filter(Boolean).join('・');
        const over = state.board[o.slot] ? '（上に）' : '';
        return `<button class="item" data-act="build" data-arg="${o.slot}" data-arg2="${o.industry}">${industryBadge(o.industry)}${escapeHtml(placeName(slotLoc(o.slot)))}${over} Lv${lv}<small>${moneyText(costOf(state, seat, o.after))}${res ? `・${res}` : ''}</small></button>`;
    }

    onWorkButton(act, arg, arg2) {
        if (!this.myTurn) return;
        const m = this.mode;
        if (act === 'mode') {
            this.mode = { type: arg, card: null, links: [], sales: [], industries: [], cards: [], slot: null, industry: null };
            if (['loan', 'pass', 'network', 'sell', 'develop'].includes(arg)) this.mode.card = this.defaultCard();
            if (arg === 'build' || arg === 'sell' || arg === 'network') this.map.resetZoom();
        } else if (act === 'cancel') {
            this.mode = null;
        } else if (act === 'confirm') {
            // 送ると、その中で描き直す（onUpdate）ので、先にモードを閉じておく。断られたら戻す
            const command = this.commandOf();
            if (!command) return;
            this.mode = null;
            if (this.controller.send(command)) return;
            this.mode = m;
        } else if (act === 'build') {
            this.pickBuild(arg, arg2, true);
            return;
        } else if (act === 'link') {
            this.pickLink(arg, true);
            return;
        } else if (act === 'second') {
            m.second = true;
        } else if (act === 'sale') {
            this.addSale(arg, arg2, true);
            return;
        } else if (act === 'develop') {
            m.industries = [...m.industries, arg];
        }
        this.render();
    }

    onCardTap(id) {
        const eligible = this.eligibleCards();
        if (!eligible || !eligible.includes(id)) return;
        const m = this.mode;
        if (m.type === 'scout') {
            m.cards = m.cards.includes(id) ? m.cards.filter(c => c !== id) : m.cards.length < 3 ? [...m.cards, id] : m.cards;
        } else {
            m.card = id;
        }
        this.render();
    }

    onMapPick(kind, id) {
        if (!this.myTurn || !this.mode) return;
        const m = this.mode;
        if (m.type === 'build' && kind === 'slot') {
            const options = this.options.build.filter(o => o.slot === id);
            if (options.length === 1) this.pickBuild(id, options[0].industry, false);
            else if (options.length > 1) {
                m.slot = id;
                m.industry = null;
                this.render();
            }
        } else if (m.type === 'network' && kind === 'link') {
            this.pickLink(id, false);
        } else if (m.type === 'sell' && kind === 'slot') {
            const choices = this.sellChoices().filter(o => o.slot === id);
            if (choices.length === 1) this.addSale(id, choices[0].merchant, false);
            else if (choices.length > 1) {
                m.pending = id;
                this.render();
            }
        }
    }

    focusSlot(slot) {
        const r = this.map.slotRectOf(slot);
        if (r) this.map.focus({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    }

    pickBuild(slot, industry, fromList) {
        const m = this.mode;
        m.slot = slot;
        m.industry = industry;
        const option = this.buildOption();
        m.card = option ? this.defaultCard(option.cards) : null;
        if (fromList) this.focusSlot(slot);
        this.render();
    }

    pickLink(id, fromList) {
        const m = this.mode;
        if (m.links.includes(id)) {
            m.links = m.links.filter(l => l !== id);
            m.second = false;
            m.secondOptions = null;
        } else if (m.links.length === 0 || (m.second && m.links.length === 1)) {
            m.links = [...m.links, id];
            m.secondOptions = null;
            if (m.links.length === 2) m.second = false;
        }
        if (fromList) {
            const point = this.map.targetPoint('link', id);
            if (point) this.map.focus(point, 1.8);
        }
        this.render();
    }

    addSale(slot, merchant, fromList) {
        const m = this.mode;
        m.sales = [...m.sales, { slot, merchant }];
        m.pending = null;
        if (fromList) this.focusSlot(slot);
        this.render();
    }

    // ---- ダイアログ ----

    showMat(seat) {
        if (!this.view) return;
        const { state } = this.view;
        const p = state.players[seat];
        const ep = eraPoints(state, seat);
        $('#mat-title').innerHTML = `<i class="dot" style="background:${PLAYER_COLORS[seat]}"></i>${escapeHtml(p.name)}のボード`;
        const rows = INDUSTRY_ORDER.map(ind => {
            const level = nextLevel(p, ind);
            const left = p.mat[ind].map((n, i) => `<span class="${level === i + 1 ? 'next' : ''} ${n === 0 ? 'gone' : ''}">${i + 1}:${n}</span>`).join('');
            if (!level) return `<tr><th>${industryBadge(ind)}${INDUSTRIES[ind].name}</th><td colspan="6" class="muted">残りなし</td></tr><tr class="left"><td colspan="7">${left}</td></tr>`;
            const td = tileDef(ind, level);
            const res = [td.coal ? `石${td.coal}` : '', td.iron ? `鉄${td.iron}` : ''].filter(Boolean).join(' ') || '—';
            const extra = INDUSTRIES[ind].sell ? `ビ${td.beer}` : INDUSTRIES[ind].resource === 'beer' ? `ビ${state.era === 'canal' ? 1 : 2}` : `産${td.produce}`;
            const marks = [td.canalOnly ? '運' : '', td.railOnly ? '鉄道' : '', td.noDevelop ? '💡' : ''].filter(Boolean).join('');
            return `<tr><th>${industryBadge(ind)}${INDUSTRIES[ind].name}</th><td>Lv${level}${marks ? `<small>${marks}</small>` : ''}</td><td>£${td.cost}</td><td>${res}</td><td>${td.vp}点</td><td>収${td.income}</td><td>${extra}・リ${td.link}</td></tr><tr class="left"><td colspan="7">${left}</td></tr>`;
        }).join('');
        $('#mat-body').innerHTML = `
            <p class="mat-sum">得点 <b>${p.vp}</b>・お金 <b>£${p.money}</b>・収入 <b>${p.income >= 0 ? '+' : ''}${p.income}</b>・手札 ${p.handCount}枚<br>
            <span class="muted">今、時代が終わると：リンク ${ep.links}点・タイル ${ep.tiles}点</span></p>
            <table class="mat-table"><thead><tr><th>産業</th><th>次</th><th>費用</th><th>資源</th><th>得点</th><th>収入</th><th>売る/産出</th></tr></thead><tbody>${rows}</tbody></table>
            <p class="muted note">「次」は次に建てるタイル。運＝運河の時代だけ、💡＝開発で外せない。下の段は「レベル:残りの枚数」。ビ＝ビール、産＝産出、リ＝リンクの点</p>`;
        this.openDialog('#mat');
    }

    showLog() {
        if (!this.controller) return;
        const { state } = this.view;
        const logs = this.controller.game.logs.filter(l => l.text);
        let lastRound = null;
        $('#log-list').innerHTML = logs.map(l => {
            const head = `${eraName(l.era)} ${l.round}`;
            const sep = head !== lastRound ? `<li class="sep">${head}</li>` : '';
            lastRound = head;
            return sep + this.logLine(l, state);
        }).join('');
        this.openDialog('#log');
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    showResult() {
        if (!this.view?.over || $('#result').open) return;
        const results = this.view.results;
        const me = this.view.seat;
        const won = results.find(r => r.seat === me)?.rank === 1;
        $('#result-title').textContent = won ? 'あなたの勝ち！' : `${results[0].name}の勝ち`;
        $('#result-list').innerHTML = results.map(r => {
            const eras = r.eras.map((e, i) => `${i === 0 ? '運河' : '鉄道'} ${e.links + e.tiles}（リンク${e.links}・タイル${e.tiles}）`).join('<br>');
            return `<li class="${r.seat === me ? 'me' : ''}"><span class="rank">${r.rank}</span><span class="rname" style="color:${PLAYER_COLORS[r.seat]}">${escapeHtml(r.name)}</span><span class="rvp"><b>${r.vp}</b>点</span><span class="rsub">${eras}<br>収入 ${r.income}・£${r.money}</span></li>`;
        }).join('');
        this.openDialog('#result');
    }
}

