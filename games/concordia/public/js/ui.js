/**
 * 画面の描画と操作
 * 画面はビュー（getView）だけを見て描き、操作は controller.send で送る
 * カードを押すと説明と使い方が出る。使い方によって、地図の上の押せるもの（植民者・道・都市・州）を金色に光らせる
 */

import LocalGameController, { loadSavedGame, clearSavedGame, CPU_STEP_DELAY_MS } from './game-controller.js';
import Game from './game.js';
import { CARD_TYPES, GOODS, GOOD_NAMES, PRICE, BUILD_VALUE, DISPLAY_SURCHARGE, STORE_SIZE, BONUS_COINS, ROMAN, GOD_NAMES, GODS, COLONIST_MONEY_BASE } from './cards.js';
import { CITY, ROAD, ROADS, PROVINCES, ROME } from './map.js';
import { renderMap } from './map-view.js';
import { insertSymbols, goodIcon, cardText, godText, GOD_COLORS, PLAYER_COLORS } from './art.js';
import { helpHtml } from './help.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { getServerUrl } from './online-config.js';
import * as Motion from './motion/motion.js';
import { snapshot, animateDiff, flyIn } from './anim.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';

const GAME = 'concordia';
const SETTINGS_KEY = 'concordia.settings';
const esc = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const $ = (id) => document.getElementById(id);
const distance = (colonist, road) => Game.prototype.distance.call(null, colonist, road);

// 動きの目印：家は「都市:持ち主」、市場は場所、手札はカードの id、数は欄ごとの何番目か
const SLIDE_MS = 420; // 植民者が進む長さ（普通の速さ）
const HOUSES = { key: el => el.dataset.house, value: () => '' };
const MARKET = { key: el => el.dataset.slot, value: el => el.innerHTML };
const HAND = { key: el => el.dataset.card, value: () => '' };
const AMOUNTS = '#players .pstats > span, #store .sg';
const amountKey = el => `${el.closest('[data-player]')?.dataset.player ?? 'me'}:${[...el.closest('[data-player], #store').querySelectorAll('.pstats > span, .sg')].indexOf(el)}`;
// 植民者の位置（g の transform="translate(x,y)"）
const spotOf = (el) => {
    const [, x, y] = el.getAttribute('transform')?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/) ?? [];
    return { x: Number(x), y: Number(y) };
};
const colonistSpots = (root) => new Map([...(root?.querySelectorAll('.colonist[data-col-id]') ?? [])].map(el => [el.dataset.colId, spotOf(el)]));

function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return { count: [2, 3, 4, 5].includes(s.count) ? s.count : 3, level: s.level === 'easy' ? 'easy' : 'normal' };
    } catch {
        return { count: 3, level: 'normal' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// 費用 { goods, wild, money } を、品のアイコンの並びにする
function costHtml(goods = {}, wild = 0, money = 0) {
    let s = '';
    Object.entries(goods).forEach(([g, n]) => { for (let i = 0; i < n; i++) s += goodIcon(g); });
    for (let i = 0; i < wild; i++) s += goodIcon('any');
    if (money) s += `<span class="money-tag"><svg class="gi"><use href="#i-coin"/></svg>${money}</span>`;
    return s || '<span class="free">なし</span>';
}

export default class UI {
    constructor() {
        insertSymbols($('symbols'));
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.mode = null;       // 地図で選んでいる途中：{ kind: 'prefect' | 'colonist', card, copy, place } など
        this.selected = null;   // 建築家で選んだ植民者
        this.sending = false;
        this.bindTitle();
        Motion.mountSpeedSetting($('motion-setting'), { label: '' });
        this.bindGame();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'コンコルディア',
            game: 'concordia',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: CPU_STEP_DELAY_MS,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [],
            onStart: (controller) => this.begin(controller),
            onUpdate: () => this.refresh(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            },
            onExit: () => {
                document.querySelectorAll('dialog[open]').forEach(d => d.close());
                this.showTitle();
            }
        });
        $('help-body').innerHTML = helpHtml();
    }

    // ---- タイトル ----

    bindTitle() {
        const setSeg = (container, attr, value) => {
            container.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset[attr] === String(value))));
        };
        const count = $('player-count');
        const level = $('cpu-level');
        setSeg(count, 'count', this.settings.count);
        setSeg(level, 'level', this.settings.level);
        count.addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b) return;
            this.settings.count = Number(b.dataset.count);
            setSeg(count, 'count', this.settings.count);
            saveSettings(this.settings);
        });
        level.addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b) return;
            this.settings.level = b.dataset.level;
            setSeg(level, 'level', this.settings.level);
            saveSettings(this.settings);
        });
        $('start').addEventListener('click', () => this.startGame());
        $('online-button').addEventListener('click', () => this.online.open());
        $('resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('open-help-title').addEventListener('click', () => this.openDialog('help'));
        document.querySelectorAll('dialog').forEach(d => {
            d.addEventListener('click', e => {
                if (e.target === d || e.target.closest('[data-close]')) this.closeDialog(d.id);
            });
            d.addEventListener('close', () => this.controller?.setPaused(false));
        });
        document.addEventListener('contextmenu', e => {
            if (!e.target.closest('input, textarea')) e.preventDefault();
        });
    }

    showTitle() {
        this.controller?.stop();
        this.controller = null;
        $('screen-game').hidden = true;
        $('screen-title').hidden = false;
        $('resume').hidden = !loadSavedGame();
        $('online-button').hidden = !this.online?.available;
        $('title-art').innerHTML = titleArt();
    }

    startGame(saved = null) {
        const setup = saved ?? {
            players: Array.from({ length: this.settings.count }, (_, i) => (i === 0
                ? { name: 'あなた', isCPU: false }
                : { name: `CPU ${i}`, isCPU: true, cpuLevel: this.settings.level })),
            options: {}
        };
        if (!saved) clearSavedGame();
        let controller;
        try {
            controller = new LocalGameController(setup, {
                onUpdate: () => this.refresh(),
                onError: (message) => {
                    music.play('error');
                    this.toast(message);
                }
            });
        } catch (error) {
            console.error(error);
            clearSavedGame();
            this.toast('続きを読み込めませんでした');
            return;
        }
        this.begin(controller);
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    begin(controller) {
        if (this.controller !== controller) this.controller?.stop();
        this.controller = controller;
        this.view = null; // 前の対戦の画面との差は動かさない
        this.logHistory = [];
        this.mode = null;
        this.selected = null;
        this.resultShown = false;
        this.soundSeq = this.controller.getView().events.at(-1)?.seq ?? 0;
        $('screen-title').hidden = true;
        $('screen-game').hidden = false;
        this.refresh();
        if (!controller.isOnline) controller.scheduleCpu();
    }

    // ---- ゲーム画面の操作 ----

    bindGame() {
        // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
        $('home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('open-help-game').addEventListener('click', () => this.openDialog('help'));
        $('hint').addEventListener('click', () => this.showHint());
        $('open-log').addEventListener('click', () => {
            $('log-list').innerHTML = this.logHistory.slice().reverse().map(l => `<li>${esc(l)}</li>`).join('');
            this.openDialog('log');
        });
        $('map').addEventListener('click', e => this.onMapClick(e));
        $('hand').addEventListener('click', e => {
            const b = e.target.closest('[data-card]');
            if (b) this.openCard(Number(b.dataset.card));
        });
        $('players').addEventListener('click', e => {
            const b = e.target.closest('[data-player]');
            if (b) this.openPlayer(Number(b.dataset.player));
        });
        $('market').addEventListener('click', e => {
            const b = e.target.closest('[data-slot]');
            if (b) this.openMarketCard(Number(b.dataset.slot));
        });
        $('actions').addEventListener('click', e => {
            const b = e.target.closest('[data-action]');
            if (b) this.onAction(b.dataset.action);
        });
        $('again').addEventListener('click', () => {
            this.closeDialog('result');
            if (this.controller?.isOnline) return this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
            this.startGame();
        });
        $('result-home').addEventListener('click', () => {
            this.closeDialog('result');
            if (this.controller?.isOnline) return this.online.leave();
            this.showTitle();
        });
        $('result-close').addEventListener('click', () => this.closeDialog('result'));
    }

    openDialog(id) {
        const d = $(id);
        if (!d.open) d.showModal();
        // 1人プレイなので、ダイアログを開いている間は CPU を止める
        this.controller?.setPaused(true);
    }

    closeDialog(id) {
        const d = $(id);
        if (d.open) d.close();
    }

    toast(message) {
        const t = $('toast');
        t.textContent = message;
        t.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
    }

    send(command) {
        const ok = this.controller.send(command);
        return ok;
    }

    get me() {
        return this.view.players[this.view.you];
    }

    get myTurn() {
        return this.view.current === this.view.you && this.view.phase !== 'end';
    }

    // ---- 描画 ----

    refresh() {
        if (!this.controller) return;
        const prev = this.view;
        this.view = this.controller.getView();
        // 手が進んだときだけ、描き直す前の画面を測って、描いたあとに差を動かす
        const moved = Boolean(prev) && this.view.logCount !== prev.logCount;
        const before = moved ? this.captureMotion() : null;
        // オンライン対戦のビューは新しい記録だけを運ぶので、記録の一覧のためにためておく（logCount は全体の数）
        const from = this.view.logCount - this.view.logs.length;
        this.logHistory = this.logHistory.slice(0, from).concat(this.view.logs);
        $('hint').hidden = Boolean(this.controller.isOnline); // ヒントはローカル対戦だけ
        if (!this.myTurn) {
            this.mode = null;
            this.selected = null;
        }
        if (this.view.phase !== 'architect') this.selected = null;
        this.renderPlayers();
        this.renderMap();
        this.renderMarket();
        this.renderStore();
        this.renderHand();
        this.renderActions();
        this.markHint();
        this.playSounds(this.view);
        if (moved) this.animateMotion(before);
        if (this.view.phase === 'end' && !this.resultShown) {
            this.resultShown = true;
            // 結果の画面は、最後の手の動きが終わってから出す
            Motion.afterIdle(() => this.showResult(), 600);
        }
    }

    // ---- 動き（描き直しの前後の差） ----

    // 描き直す前：植民者の位置・都市の家・市場・手札・数
    captureMotion() {
        return {
            colonists: colonistSpots($('map')),
            houses: snapshot($('map'), '.house[data-house]', HOUSES),
            market: snapshot($('market'), '.mrow[data-slot]', MARKET),
            hand: snapshot($('hand'), '.hcard[data-card]', HAND),
            amounts: snapshot(document, AMOUNTS, { key: amountKey })
        };
    }

    // 描いたあと：植民者は前の場所から滑らせ（新しい植民者と家は現れ）、市場で入れ替わった札ははねて出し、
    // 手札に来た札は市場から飛ばし、数の変化を目立たせる。地図は SVG なので、大きさを変える動きは使わない
    animateMotion(before) {
        if (!Motion.enabled()) return;
        const map = $('map');
        for (const el of map.querySelectorAll('.colonist[data-col-id]')) {
            const old = before.colonists.get(el.dataset.colId);
            const now = spotOf(el);
            if (!old) {
                Motion.fadeIn(el, { duration: 320 });
                continue;
            }
            if (Math.abs(old.x - now.x) < 0.5 && Math.abs(old.y - now.y) < 0.5) continue;
            const length = Motion.ms(SLIDE_MS);
            const animation = el.animate([
                { transform: `translate(${old.x}px, ${old.y}px)` },
                { transform: `translate(${now.x}px, ${now.y}px)` }
            ], { duration: length, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'backwards' });
            Motion.track(animation, length);
        }
        animateDiff(before.houses, map, '.house[data-house]', { ...HOUSES, enter: el => Motion.fadeIn(el, { duration: 360 }) });
        animateDiff(before.market, $('market'), '.mrow[data-slot]', { ...MARKET, enter: null, change: el => Motion.popIn(el, { duration: 320 }) });
        animateDiff(before.hand, $('hand'), '.hcard[data-card]', { ...HAND, enter: el => flyIn(el, $('market')) });
        animateDiff(before.amounts, document, AMOUNTS, { key: amountKey });
    }

    // 効果音：前の更新からのできごとを見て、1回の更新に1つだけ鳴らす
    // 自分の手は得る（お金・品物）、払う（カードを買う）、置く（建てる・入植・移動・カードを出す）。
    // ほかの人の手のあとは自分の番か知らせ、終局は勝ち（同点は知らせ）・負け
    playSounds(v) {
        const fresh = v.events.filter(e => e.seq > this.soundSeq);
        if (!fresh.length) return;
        this.soundSeq = fresh.at(-1).seq;
        if (fresh.some(e => e.type === 'end')) {
            if (!v.winners.includes(v.you)) return music.play('lose');
            return music.play(v.winners.length > 1 ? 'notify' : 'win');
        }
        const mine = fresh.filter(e => e.seat === v.you);
        if (mine.length && mine.length === fresh.filter(e => e.seat !== undefined).length) {
            if (mine.some(e => ['cash', 'colonistCash', 'produce', 'trade', 'craft', 'concordia'].includes(e.type))) return music.play('gain');
            if (mine.some(e => e.type === 'buy')) return music.play('pay');
            return music.play('place');
        }
        music.play(this.myTurn ? 'turn' : 'notify');
    }

    renderPlayers() {
        const v = this.view;
        $('players').innerHTML = v.players.map(p => {
            const top = p.discardTop ? CARD_TYPES[p.discardTop.type].name : '—';
            return `<button class="pchip${p.id === v.current ? ' turn' : ''}${p.id === v.you ? ' me' : ''}" data-player="${p.id}" style="--pc:${PLAYER_COLORS[p.color]}">
                <span class="pname">${esc(p.name)}${v.magnus === p.id ? '<svg class="mag" aria-label="プラエフェクトゥス・マグヌス"><use href="#i-magnus"/></svg>' : ''}${p.concordia ? '<span class="conc" title="コンコルディア">C</span>' : ''}</span>
                <span class="pstats"><span><svg class="gi"><use href="#i-coin"/></svg>${p.money}</span><span><svg class="gi house-ico"><use href="#i-house"/></svg>${15 - p.housesLeft}</span><span class="ptop">${esc(top)}</span></span>
            </button>`;
        }).join('');
    }

    renderMap() {
        const v = this.view;
        const ui = { glowColonists: [], glowRoads: [], glowCities: [], glowProvinces: [], selectedColonist: this.selected };
        const lastBuild = [...v.events].reverse().find(e => e.type === 'build');
        if (lastBuild) ui.lastCity = lastBuild.city;
        if (this.myTurn && v.phase === 'architect') {
            const arch = v.architect;
            const mine = v.colonists.filter(c => c.owner === v.you && (c.city !== null || c.road !== null));
            if (!arch.built && arch.steps > 0) {
                ui.glowColonists = mine.filter(c => this.reachableRoads(c).length > 0).map(c => c.id);
                if (this.selected !== null) ui.glowRoads = this.reachableRoads(v.colonists[this.selected]);
            }
            ui.glowCities = this.buildableCities().filter(city => this.canBuild(city));
        } else if (this.mode?.kind === 'prefect') {
            ui.glowProvinces = PROVINCES.filter(pr => v.bonus[pr.id].active).map(pr => pr.id);
        } else if (this.mode?.kind === 'colonist') {
            if (this.colonistsLeft() > 0) ui.glowCities = this.colonistCities();
        }
        $('map').innerHTML = renderMap(v, ui) + this.statusHtml();
        this.markHint();
    }

    // ヒント：CPU（ふつう）が選ぶ操作。使うカード・動かす植民者・建てる都市に印を付ける
    showHint() {
        const c = this.myTurn ? this.controller?.hint() : null;
        if (!c) return this.toast('自分の番になったら、おすすめを出せます');
        this.mode = null;
        if (c.type === 'move') this.selected = c.colonist;
        this.hint = { key: this.view.events.at(-1)?.seq ?? 0, command: c };
        this.refresh();
        const text = {
            play: () => `「${CARD_TYPES[this.me.hand.find(h => h.id === c.card)?.type]?.name ?? 'カード'}」を使う`,
            move: () => '選んだ植民者を動かす',
            build: () => '光る都市に家を建てる',
            finish: () => '建築家を終える'
        }[c.type]?.() ?? '光るところを押す';
        this.toast(`おすすめ：${text}`);
    }

    markHint() {
        const h = this.hint;
        if (!h || !this.myTurn || h.key !== (this.view.events.at(-1)?.seq ?? 0)) return;
        const c = h.command;
        const mark = (selector) => document.querySelectorAll(selector).forEach(el => el.classList.add('recommended'));
        if (c.type === 'play') mark(`#hand [data-card="${c.card}"]`);
        if (c.type === 'move') mark(`#map [data-road="${c.road}"]`);
        if (c.type === 'build') mark(`#map [data-city="${c.city}"]`);
        if (c.type === 'finish') mark('#actions [data-action="finish"]');
    }

    // 地図の左上に出す、今していることの短い表示
    statusHtml() {
        const v = this.view;
        let text = '';
        if (v.phase === 'end') text = 'ゲーム終了';
        else if (!this.myTurn) text = `${esc(v.players[v.current].name)}の番`;
        else if (v.phase === 'architect') text = v.architect.built ? '家を建てる' : `建築家：あと ${v.architect.steps} 歩`;
        else if (this.mode?.kind === 'prefect') text = '生産させる州を選ぶ';
        else if (this.mode?.kind === 'colonist') text = `植民者を置く都市を選ぶ（${this.mode.place.length}人）`;
        else text = 'カードを1枚使う';
        const last = v.logs.at(-1);
        const final = v.finalTurns ? `<div class="final">最後の手番</div>` : '';
        return `<div class="map-status">${final}<span>${text}</span></div>${last ? `<div class="ticker">${esc(last)}</div>` : ''}`;
    }

    renderMarket() {
        const v = this.view;
        const rows = v.display.map((card, slot) => {
            if (!card) return `<div class="mrow empty"></div>`;
            const type = CARD_TYPES[card.type];
            const surcharge = DISPLAY_SURCHARGE[slot];
            const extra = surcharge.map(g => goodIcon(g)).join('');
            return `<button class="mrow" data-slot="${slot}" style="--god:${GOD_COLORS[type.god]}">
                <span class="mname">${type.name}</span>
                <span class="mcost">${costHtml(type.cost)}${extra ? `<span class="extra">＋${extra}</span>` : ''}</span>
            </button>`;
        }).join('');
        const deck = v.deckCount ? `山札 ${v.deckCount}（${ROMAN[v.deckPhase]}）` : '山札なし';
        $('market').innerHTML = `<div class="mhead"><span>市場</span><span class="deck">${deck}</span></div>${rows}`;
    }

    renderStore() {
        const p = this.me;
        const goods = GOODS.map(g => `<span class="sg${p.goods[g] ? '' : ' zero'}">${goodIcon(g)}<b>${p.goods[g]}</b></span>`).join('');
        $('store').innerHTML = `
            <div class="srow goods">${goods}</div>
            <div class="srow">
                <span class="sg"><svg class="gi"><use href="#i-coin"/></svg><b>${p.money}</b></span>
                <span class="sg" title="倉庫の植民者"><svg class="gi col-ico"><use href="#c-land"/></svg><b>${p.store.land}</b><svg class="gi col-ico"><use href="#c-sea"/></svg><b>${p.store.sea}</b></span>
                <span class="sg" title="倉庫"><b>${p.storeUsed}/${STORE_SIZE}</b></span>
                <span class="sg" title="残りの家"><svg class="gi house-ico" style="color:${PLAYER_COLORS[p.color]}"><use href="#i-house"/></svg><b>${p.housesLeft}</b></span>
            </div>`;
    }

    renderHand() {
        const p = this.me;
        const playable = this.myTurn && this.view.phase === 'turn' && !this.mode;
        const cards = p.hand.map(card => {
            const type = CARD_TYPES[card.type];
            return `<button class="hcard${playable ? ' glow' : ''}" data-card="${card.id}" style="--god:${GOD_COLORS[type.god]}"><span class="hname">${type.name}</span><span class="hgod">${GOD_NAMES[type.god]}</span></button>`;
        }).join('');
        const discard = p.discardCount ? `<div class="hdiscard" title="捨て札"><span>捨て札</span><b>${p.discardCount}</b></div>` : '';
        $('hand').innerHTML = cards + discard;
    }

    renderActions() {
        const v = this.view;
        let s = '';
        if (this.myTurn && v.phase === 'architect') s = '<button class="btn primary small" data-action="finish">終える</button>';
        else if (this.mode?.kind === 'prefect') s = '<button class="btn secondary small" data-action="cancel">やめる</button>';
        else if (this.mode?.kind === 'colonist') {
            s = `<button class="btn primary small" data-action="place"${this.mode.place.length ? '' : ' disabled'}>置く</button><button class="btn secondary small" data-action="cancel">やめる</button>`;
        }
        $('actions').innerHTML = s;
    }

    // ---- 建築家の補助 ----

    reachableRoads(colonist) {
        const v = this.view;
        const occupied = new Set(v.colonists.filter(c => c.road !== null).map(c => c.road));
        return ROADS.filter(r => r.kind === colonist.kind && r.id !== colonist.road && !occupied.has(r.id) && distance(colonist, r.id) <= v.architect.steps).map(r => r.id);
    }

    buildableCities() {
        const v = this.view;
        const set = new Set();
        v.colonists.forEach(c => {
            if (c.owner !== v.you || c.road === null) return;
            [ROAD[c.road].a, ROAD[c.road].b].forEach(city => {
                if (city !== ROME && !v.houses[city].includes(v.you)) set.add(city);
            });
        });
        return [...set];
    }

    buildCost(city) {
        const good = this.view.cityGoods[city];
        const goods = good === 'brick' ? { food: 1 } : { brick: 1, [good]: 1 };
        return { goods, money: BUILD_VALUE[good] * (this.view.houses[city].length + 1) };
    }

    canBuild(city) {
        const p = this.me;
        const { goods, money } = this.buildCost(city);
        return p.housesLeft > 0 && p.money >= money && Object.entries(goods).every(([g, n]) => p.goods[g] >= n);
    }

    // ---- 地図を押す ----

    onMapClick(e) {
        if (!this.myTurn || !this.view) return;
        const col = e.target.closest('[data-colonist]');
        const road = e.target.closest('[data-road]');
        const city = e.target.closest('[data-city]');
        const province = e.target.closest('[data-province]');
        const v = this.view;
        if (v.phase === 'architect') {
            if (col) {
                const id = Number(col.dataset.colonist);
                this.selected = this.selected === id ? null : id;
                this.renderMap();
                return;
            }
            if (road && this.selected !== null) {
                if (this.send({ type: 'move', colonist: this.selected, road: Number(road.dataset.road) })) {
                    // 続けて動かせるなら、選んだままにする
                    const c = this.view.colonists[this.selected];
                    if (!c || this.reachableRoads(c).length === 0) this.selected = null;
                    this.renderMap();
                }
                return;
            }
            if (city) this.confirmBuild(city.dataset.city);
            return;
        }
        if (this.mode?.kind === 'prefect' && province) {
            this.playMode({ province: province.dataset.province });
            return;
        }
        if (this.mode?.kind === 'colonist' && city) this.chooseColonistKind(city.dataset.city);
    }

    confirmBuild(city) {
        const { goods, money } = this.buildCost(city);
        const c = CITY[city];
        const pr = PROVINCES.find(x => x.id === c.province);
        this.prompt(`<h2>${c.ja}に家を建てる</h2>
            <p class="note">${pr.ja}・${GOOD_NAMES[this.view.cityGoods[city]]}の都市${this.view.houses[city].length ? `（家 ${this.view.houses[city].length} 軒）` : ''}</p>
            <div class="cost-line">${costHtml(goods, 0, money)}</div>
            <div class="buttons"><button class="btn primary" data-do="build">建てる</button><button class="btn secondary" data-close>やめる</button></div>`, {
            build: () => {
                this.closeDialog('prompt');
                this.send({ type: 'build', city });
            }
        });
    }

    onAction(action) {
        if (action === 'finish') this.send({ type: 'finish' });
        if (action === 'cancel') {
            this.mode = null;
            this.refresh();
        }
        if (action === 'place') this.playMode({ place: this.mode.place });
    }

    // 地図で選んだ答えで、カードを使う
    playMode(extra) {
        const { card, copy } = this.mode;
        const command = { type: 'play', card, ...(copy !== undefined ? { copy } : {}), ...extra };
        this.mode = null;
        if (!this.send(command)) this.refresh();
    }

    // ---- ダイアログ ----

    // html の中の data-do="名前" のボタンに、handlers[名前] を結ぶ
    prompt(html, handlers = {}) {
        const body = $('prompt-body');
        body.innerHTML = html;
        body.querySelectorAll('[data-do]').forEach(b => {
            b.addEventListener('click', () => handlers[b.dataset.do]?.(b));
        });
        this.openDialog('prompt');
        return body;
    }

    cardInfoHtml(typeId) {
        const t = CARD_TYPES[typeId];
        return `<div class="card-head" style="--god:${GOD_COLORS[t.god]}"><h2>${t.name}</h2><span class="god">${GOD_NAMES[t.god]}</span></div>
            <p class="ctext">${cardText(typeId)}</p>
            <p class="gtext"><span class="god-dot" style="--god:${GOD_COLORS[t.god]}"></span>${GOD_NAMES[t.god]}：${godText(typeId)}</p>`;
    }

    openCard(cardId) {
        const card = this.me.hand.find(c => c.id === cardId);
        if (!card) return;
        const canPlay = this.myTurn && this.view.phase === 'turn' && !this.mode;
        const buttons = canPlay ? this.actionButtons(card.type, card.id) : [];
        this.prompt(`${this.cardInfoHtml(card.type)}
            <div class="buttons wrap">${buttons.map((b, i) => `<button class="btn ${b.cls ?? 'primary'}" data-do="b${i}"${b.disabled ? ' disabled' : ''}>${b.label}</button>`).join('')}<button class="btn secondary" data-close>閉じる</button></div>`,
        Object.fromEntries(buttons.map((b, i) => [`b${i}`, () => {
            this.closeDialog('prompt');
            b.run();
        }])));
    }

    // カードの使い方のボタン { label, run, disabled }
    actionButtons(typeId, card, copy) {
        const t = CARD_TYPES[typeId];
        const p = this.me;
        const v = this.view;
        const base = { type: 'play', card, ...(copy !== undefined ? { copy } : {}) };
        const send = (extra = {}) => this.send({ ...base, ...extra });
        switch (t.kind) {
            case 'tribune': {
                const back = p.discardCount + 1;
                const money = Math.max(0, back - 3);
                const canCol = p.goods.food >= 1 && p.goods.tool >= 1;
                const list = [{ label: `戻す${money ? `（＋${money}）` : ''}`, run: () => send() }];
                if (canCol && p.store.land > 0) list.push({ label: '戻して陸の植民者をローマへ', cls: 'sea', run: () => send({ colonist: 'land' }) });
                if (canCol && p.store.sea > 0) list.push({ label: '戻して海の植民者をローマへ', cls: 'sea', run: () => send({ colonist: 'sea' }) });
                return list;
            }
            case 'architect':
            case 'craftsman':
                return [{ label: '使う', run: () => send() }];
            case 'prefect': {
                const coins = PROVINCES.filter(pr => !v.bonus[pr.id].active).reduce((s, pr) => s + BONUS_COINS[v.bonus[pr.id].good], 0);
                return [
                    { label: '州を選んで生産', run: () => { this.mode = { kind: 'prefect', card, copy }; this.refresh(); }, disabled: !PROVINCES.some(pr => v.bonus[pr.id].active) },
                    { label: `お金を受け取る（${coins}）`, cls: 'sea', run: () => send({ cash: true }) }
                ];
            }
            case 'mercator':
                return [{ label: '使う', run: () => this.openTrade(base, t.money) }];
            case 'senator':
            case 'consul':
                return [{ label: '使う', run: () => this.openBuy(base, t.kind === 'senator') }];
            case 'colonist': {
                const onBoard = v.colonists.filter(c => c.owner === v.you && (c.city !== null || c.road !== null)).length;
                const canPlace = p.goods.food >= 1 && p.goods.tool >= 1 && p.store.land + p.store.sea > 0;
                return [
                    { label: '植民者を置く', run: () => { this.mode = { kind: 'colonist', card, copy, place: [] }; this.refresh(); }, disabled: !canPlace },
                    { label: `お金を受け取る（${COLONIST_MONEY_BASE + onBoard}）`, cls: 'sea', run: () => send({ cash: true }) }
                ];
            }
            case 'diplomat': {
                const list = [];
                v.players.forEach(other => {
                    if (other.id === v.you || !other.discardTop) return;
                    const top = CARD_TYPES[other.discardTop.type];
                    if (top.kind === 'diplomat') return;
                    list.push({ label: `${esc(other.name)}の${top.name}`, cls: 'sea', run: () => this.openCopied(other.discardTop.type, card, other.id) });
                });
                if (!list.length) list.push({ label: 'まねられるカードがありません', disabled: true, run: () => {} });
                return list;
            }
            default:
                return [];
        }
    }

    // 外交官でまねるカードの使い方
    openCopied(typeId, card, copy) {
        const buttons = this.actionButtons(typeId, card, copy);
        this.prompt(`${this.cardInfoHtml(typeId)}
            <div class="buttons wrap">${buttons.map((b, i) => `<button class="btn ${b.cls ?? 'primary'}" data-do="b${i}"${b.disabled ? ' disabled' : ''}>${b.label}</button>`).join('')}<button class="btn secondary" data-close>やめる</button></div>`,
        Object.fromEntries(buttons.map((b, i) => [`b${i}`, () => {
            this.closeDialog('prompt');
            b.run();
        }])));
    }

    // ---- 植民者 ----

    colonistCities() {
        const v = this.view;
        return [ROME, ...Object.entries(v.houses).filter(([, owners]) => owners.includes(v.you)).map(([city]) => city)];
    }

    // まだ置ける人数（品と倉庫の植民者から）
    colonistsLeft() {
        const p = this.me;
        const used = this.mode.place.length;
        return Math.min(p.goods.food - used, p.goods.tool - used, p.store.land + p.store.sea - used);
    }

    chooseColonistKind(city) {
        const p = this.me;
        const used = { land: 0, sea: 0 };
        this.mode.place.forEach(x => used[x.kind]++);
        const kinds = ['land', 'sea'].filter(k => p.store[k] - used[k] > 0);
        const add = (kind) => {
            this.mode.place.push({ city, kind });
            this.refresh();
        };
        if (kinds.length === 1) {
            add(kinds[0]);
            return;
        }
        this.prompt(`<h2>${CITY[city].ja}に置く植民者</h2>
            <div class="buttons"><button class="btn primary" data-do="land"><svg class="gi"><use href="#c-land"/></svg>陸</button><button class="btn sea" data-do="sea"><svg class="gi"><use href="#c-sea"/></svg>海</button><button class="btn secondary" data-close>やめる</button></div>`, {
            land: () => { this.closeDialog('prompt'); add('land'); },
            sea: () => { this.closeDialog('prompt'); add('sea'); }
        });
    }

    // ---- 商人 ----

    openTrade(base, income) {
        const p = this.me;
        const amounts = Object.fromEntries(GOODS.map(g => [g, 0]));
        const body = this.prompt(`<h2>商人：＋${income} セステルティウス</h2>
            <p class="note">2種類まで売り買いできます</p>
            <div class="trade" id="trade"></div>
            <p class="note" id="trade-sum"></p>
            <div class="buttons"><button class="btn primary" data-do="ok" id="trade-ok">決める</button><button class="btn secondary" data-close>やめる</button></div>`, {
            ok: () => {
                const trades = GOODS.filter(g => amounts[g] !== 0).map(g => ({ good: g, amount: amounts[g] }));
                this.closeDialog('prompt');
                this.send({ ...base, trades });
            }
        });
        const draw = () => {
            const types = GOODS.filter(g => amounts[g] !== 0);
            const money = p.money + income - GOODS.reduce((s, g) => s + amounts[g] * PRICE[g], 0);
            const used = p.storeUsed + GOODS.reduce((s, g) => s + amounts[g], 0);
            body.querySelector('#trade').innerHTML = GOODS.map(g => {
                const locked = types.length >= 2 && amounts[g] === 0;
                const n = amounts[g];
                return `<div class="trow${locked ? ' locked' : ''}">
                    ${goodIcon(g)}<span class="tname">${GOOD_NAMES[g]}<small>${PRICE[g]}</small></span>
                    <span class="thave">${p.goods[g] + n}</span>
                    <button class="step" data-g="${g}" data-d="-1"${locked || p.goods[g] + n <= 0 ? ' disabled' : ''}>−</button>
                    <span class="tamt ${n > 0 ? 'buy' : n < 0 ? 'sell' : ''}">${n > 0 ? `買う ${n}` : n < 0 ? `売る ${-n}` : ''}</span>
                    <button class="step" data-g="${g}" data-d="1"${locked || money < PRICE[g] || used >= STORE_SIZE ? ' disabled' : ''}>＋</button>
                </div>`;
            }).join('');
            body.querySelector('#trade-sum').innerHTML = `お金 ${money}・倉庫 ${used}/${STORE_SIZE}`;
        };
        body.querySelector('#trade').addEventListener('click', e => {
            const b = e.target.closest('.step');
            if (!b || b.disabled) return;
            amounts[b.dataset.g] += Number(b.dataset.d);
            draw();
        });
        draw();
    }

    // ---- 元老院議員・執政官 ----

    openMarketCard(slot) {
        const card = this.view.display[slot];
        if (!card) return;
        const type = CARD_TYPES[card.type];
        const extra = DISPLAY_SURCHARGE[slot];
        this.prompt(`${this.cardInfoHtml(card.type)}
            <p class="note">費用 ${costHtml(type.cost)}　元老院議員で買うときは、さらに ${extra.length ? extra.map(g => goodIcon(g)).join('') : 'なし'}</p>
            <div class="buttons"><button class="btn secondary" data-close>閉じる</button></div>`);
    }

    openBuy(base, senator) {
        const v = this.view;
        const p = this.me;
        const max = senator ? 2 : 1;
        const chosen = [];       // { slot, wild: [good...] }
        const body = this.prompt(`<h2>${senator ? '元老院議員：2枚まで買う' : '執政官：1枚買う'}</h2>
            <div class="buy-list" id="buy-list"></div>
            <div id="buy-wild"></div>
            <div class="buttons"><button class="btn primary" data-do="ok" id="buy-ok">買う</button><button class="btn secondary" data-close>やめる</button></div>`, {
            ok: () => {
                this.closeDialog('prompt');
                this.send({ ...base, buys: chosen.map(c => ({ slot: c.slot, wild: c.wild })) });
            }
        });
        const costOf = (slot) => {
            const type = CARD_TYPES[v.display[slot].type];
            const goods = { ...type.cost };
            let wild = 0;
            if (senator) DISPLAY_SURCHARGE[slot].forEach(g => { if (g === 'any') wild++; else goods[g] = (goods[g] ?? 0) + 1; });
            return { goods, wild };
        };
        // 選んだカードで使う品の残り
        const left = () => {
            const rest = { ...p.goods };
            chosen.forEach(c => {
                const { goods } = costOf(c.slot);
                Object.entries(goods).forEach(([g, n]) => { rest[g] -= n; });
                c.wild.forEach(g => { rest[g] -= 1; });
            });
            return rest;
        };
        // 好きな品は、残りの多い安い品から自動で選ぶ（あとで変えられる）
        const autoWild = (rest, n) => {
            const out = [];
            for (let i = 0; i < n; i++) {
                const g = [...GOODS].filter(x => rest[x] > 0).sort((a, b) => PRICE[a] - PRICE[b])[0];
                if (!g) return null;
                rest[g]--;
                out.push(g);
            }
            return out;
        };
        const affordable = (slot) => {
            const rest = left();
            const { goods, wild } = costOf(slot);
            for (const [g, n] of Object.entries(goods)) {
                rest[g] -= n;
                if (rest[g] < 0) return false;
            }
            return GOODS.reduce((s, g) => s + rest[g], 0) >= wild;
        };
        const draw = () => {
            body.querySelector('#buy-list').innerHTML = v.display.map((card, slot) => {
                if (!card) return '';
                const type = CARD_TYPES[card.type];
                const on = chosen.some(c => c.slot === slot);
                const ok = on || (chosen.length < max && affordable(slot));
                const { goods, wild } = costOf(slot);
                return `<button class="brow${on ? ' on' : ''}" data-slot="${slot}"${ok ? '' : ' disabled'} style="--god:${GOD_COLORS[type.god]}">
                    <span class="bname">${type.name}<small>${GOD_NAMES[type.god]}</small></span><span class="bcost">${costHtml(goods, wild)}</span></button>`;
            }).join('');
            body.querySelector('#buy-wild').innerHTML = chosen.filter(c => c.wild.length).map(c => `<div class="wild-row">${CARD_TYPES[v.display[c.slot].type].name}の${goodIcon('any')}：${c.wild.map((g, i) => `<span class="wild-pick" data-slot="${c.slot}" data-i="${i}">${GOODS.map(x => `<button class="wg${x === g ? ' on' : ''}" data-g="${x}">${goodIcon(x)}</button>`).join('')}</span>`).join('')}</div>`).join('');
            body.querySelector('#buy-ok').textContent = chosen.length ? `買う（${chosen.length}枚）` : '買わずに使う';
        };
        body.addEventListener('click', e => {
            const row = e.target.closest('.brow');
            if (row && !row.disabled) {
                const slot = Number(row.dataset.slot);
                const i = chosen.findIndex(c => c.slot === slot);
                if (i >= 0) chosen.splice(i, 1);
                else {
                    const rest = left();
                    const { goods, wild } = costOf(slot);
                    Object.entries(goods).forEach(([g, n]) => { rest[g] -= n; });
                    const w = autoWild(rest, wild);
                    if (w) chosen.push({ slot, wild: w });
                }
                draw();
                return;
            }
            const wg = e.target.closest('.wg');
            if (wg) {
                const pick = wg.closest('.wild-pick');
                const c = chosen.find(x => x.slot === Number(pick.dataset.slot));
                const i = Number(pick.dataset.i);
                const before = c.wild[i];
                c.wild[i] = wg.dataset.g;
                if (Object.values(left()).some(n => n < 0)) c.wild[i] = before;
                draw();
            }
        });
        draw();
    }

    // ---- ほかの人 ----

    openPlayer(id) {
        const p = this.view.players[id];
        $('player-detail-name').textContent = p.name;
        const goods = GOODS.map(g => `<span class="sg">${goodIcon(g)}<b>${p.goods[g]}</b></span>`).join('');
        const cards = p.hand ? `<p class="note">手札：${p.hand.map(c => CARD_TYPES[c.type].name).join('・') || 'なし'}</p>` : `<p class="note">手札 ${p.handCount} 枚</p>`;
        const top = p.discardTop ? `${CARD_TYPES[p.discardTop.type].name}（${p.discardCount}枚）` : 'なし';
        const score = p.score ? scoreTable([{ player: p, score: p.score }]) : '';
        $('player-detail-body').innerHTML = `<div class="srow goods">${goods}</div>
            <p class="note"><svg class="gi"><use href="#i-coin"/></svg>${p.money}　倉庫 ${p.storeUsed}/${STORE_SIZE}　残りの家 ${p.housesLeft}　持っているカード ${p.cardCount} 枚</p>
            ${cards}<p class="note">捨て札のいちばん上：${top}</p>${score ? `<h3>今の得点の見込み</h3>${score}` : ''}`;
        this.openDialog('player-detail');
    }

    // ---- 終わり ----

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
        const winner = v.players[v.winners[0]];
        $('result-title').textContent = winner.id === v.you ? 'あなたの勝ち' : `${winner.name}の勝ち`;
        const rows = v.results.map(r => ({ player: v.players[r.id], score: r })).sort((a, b) => b.score.total - a.score.total);
        $('result-body').innerHTML = scoreTable(rows);
        this.openDialog('result');
    }
}

// 得点の表（行：神、列：プレイヤー）
function scoreTable(rows) {
    const head = rows.map(r => `<th style="color:${PLAYER_COLORS[r.player.color]}">${esc(r.player.name)}</th>`).join('');
    const body = GODS.map(god => `<tr><th><span class="god-dot" style="--god:${GOD_COLORS[god]}"></span>${GOD_NAMES[god]}</th>${rows.map(r => {
        const g = r.score.gods[god];
        return `<td>${g.points}${g.cards ? `<small>${g.cards}枚</small>` : ''}</td>`;
    }).join('')}</tr>`).join('');
    const conc = `<tr><th>コンコルディア</th>${rows.map(r => `<td>${r.score.concordia || ''}</td>`).join('')}</tr>`;
    const total = `<tr class="total"><th>合計</th>${rows.map(r => `<td>${r.score.total}</td>`).join('')}</tr>`;
    return `<table class="score"><thead><tr><th></th>${head}</tr></thead><tbody>${body}${conc}${total}</tbody></table>`;
}

// タイトルの絵：地図の縮小（実際の都市と道の上に、家と植民者をいくつか置いた静止画）
function titleArt() {
    const view = {
        players: [{ color: 'red' }, { color: 'blue' }, { color: 'green' }, { color: 'yellow' }],
        houses: { massilia: [0], novaria: [1, 0], aquileia: [2], carthago: [1], athenae: [3], lutetia: [2], syracusae: [0, 3], alexandria: [1] },
        colonists: [
            { id: 0, owner: 0, kind: 'land', city: null, road: 3 }, { id: 1, owner: 1, kind: 'sea', city: null, road: 38 },
            { id: 2, owner: 2, kind: 'land', city: null, road: 6 }, { id: 3, owner: 3, kind: 'sea', city: null, road: 42 }
        ],
        cityGoods: Object.fromEntries(Object.keys(CITY).map((id, i) => [id, GOODS[(i * 3) % 5]])),
        bonus: Object.fromEntries(PROVINCES.map((pr, i) => [pr.id, { good: GOODS[i % 5], active: i % 3 !== 0 }]))
    };
    Object.keys(CITY).forEach(id => { view.houses[id] = view.houses[id] ?? []; });
    return renderMap(view, {});
}
