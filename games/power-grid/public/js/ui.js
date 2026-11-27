/**
 * 画面（タイトル・ゲーム・記録・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 */

import { PLANT, RESOURCES, RESOURCE_NAMES, TYPE_NAMES, STEP3, HOUSES } from './data.js';
import { MAPS } from './maps.js';
import { actualMarket, buildOptions, buyPrice, nextPrice, canStore, capacity } from './rules.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import MapView from './map-view.js';
import { symbolsSvg, plantHtml, resIcon, PLAYER_COLORS } from './art.js';
import { helpHtml, titleArtHtml } from './help.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import * as Motion from './motion/motion.js';
import { snapshot, animateDiff, flyIn } from './anim.js';
import { getServerUrl } from './online-config.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';

const GAME = 'power-grid';

// 自分の操作の音
const COMMAND_SOUND = { choose: 'place', bid: 'place', skip: 'select', pass: 'select', discard: 'pay', buy: 'pay', build: 'place', done: 'select' };

const SETTINGS_KEY = 'power-grid.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ', 'レン', 'ユイ'];
const RESULT_DELAY_MS = 900;

// 動きの目印：家は「都市:席」、発電所は番号、数は欄ごとの何番目か
const HOUSE_MOTION = { key: el => el.dataset.house, value: () => '' };
const PLANTS = { key: el => el.dataset.plant, value: () => '' };
const OWNED = { key: el => `${el.closest('[data-seat]')?.dataset.seat}:${el.textContent}`, value: () => '' };
const AMOUNTS = '#players .pl-money, #players .pl-cities, #phase .res-summary > span, #phase .res-left, #mine .mine-cap';
const amountKey = el => `${el.closest('[data-seat]')?.dataset.seat ?? el.parentElement.className}:${el.className}:${[...el.parentElement.children].indexOf(el)}`;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const PHASE_NAMES = { auction: '発電所の競り', resources: '資源を買う', build: '都市を建てる', bureaucracy: '官僚', end: '終わり' };

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [2, 3, 4, 5, 6].includes(saved.count) ? saved.count : 4,
            map: MAPS[saved.map] ? saved.map : 'germany',
            level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy'
        };
    } catch {
        return { count: 4, map: 'germany', level: 'easy' };
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
        this.selectedPlant = null;
        this.selectedCity = null;
        this.amount = 0;
        this.amountKey = null;
        this.buy = { coal: 0, oil: 0, garbage: 0, uranium: 0 };
        this.buyKey = null;
        this.seenCommands = 0;
        this.resultTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        $('#title-art').innerHTML = titleArtHtml();
        $('#help-body').innerHTML = helpHtml();
        this.map = new MapView($('#map'), { onPick: (city) => this.pickCity(city) });
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）。足りない席は CPU
        this.online = new NetplayLobby({
            title: '電力会社',
            game: 'power-grid',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 450,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [{ key: 'map', label: '地図', options: [{ value: 'germany', label: 'ドイツ' }, { value: 'usa', label: 'アメリカ' }] }],
            onStart: (controller) => this.beginGame(controller),
            onUpdate: () => this.onControllerUpdate(),
            onError: (message) => this.onControllerError(message),
            onExit: () => {
                this.stopGame();
                this.showTitle();
            }
        });
        this.bindStatic();
        Motion.mountSpeedSetting($('#motion-setting'), { label: '' });
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
                onUpdate: () => this.onControllerUpdate(),
                onError: (message) => this.onControllerError(message)
            });
        } catch (error) {
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.beginGame(controller);
        controller.scheduleCpu();
    }

    onControllerUpdate() {
        const previous = this.view;
        this.render();
        this.playUpdateSound(previous);
    }

    onControllerError(message) {
        music.play('error');
        this.toast(message);
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    beginGame(controller) {
        if (this.controller !== controller) this.controller?.stop();
        this.resultTimer?.();
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        this.controller = controller;
        this.view = null;
        this.selectedPlant = null;
        this.selectedCity = null;
        this.amountKey = null;
        this.buyKey = null;
        this.seenCommands = this.controller.getView().commandCount;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        this.map.resize();
        this.map.resetZoom();
    }

    newGame() {
        const { count, level, map } = this.settings;
        const players = [{ name: 'あなた', isCPU: false },
            ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true, cpuLevel: level }))];
        this.startGame({ players, options: { map } });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        this.resultTimer?.();
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    send(command) {
        if (!this.controller) return false;
        this.sending = true;
        const ok = this.controller.send(command);
        this.sending = false;
        if (ok) {
            this.selectedPlant = null;
            this.selectedCity = null;
            this.hint = null;
            if (this.view.phase !== 'end') music.play(command.type === 'buy' && !RESOURCES.some(t => command[t]) ? 'select' : COMMAND_SOUND[command.type] ?? 'place');
        }
        return ok;
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // id はシードから作る（同じ対戦を2回数えない）。1台で人が交代する対戦（人が2人以上）は送らない
    recordLocalResult(v) {
        const controller = this.controller;
        if (!controller || controller.isOnline || controller.game.players.filter(p => !p.isCPU).length !== 1) return;
        recordResult({ game: GAME, id: `${GAME}-${controller.game.options.seed}`, outcome: outcomeFromWinners(v.winners, v.you, v.players.length) });
    }

    // 1回の更新に1つの音。自分の操作の音は send で鳴らす。CPU の手は知らせ、自分の番になったらチャイム
    playUpdateSound(previous) {
        const view = this.view;
        if (!previous) return;
        if (view.phase === 'end') {
            if (previous.phase !== 'end') {
                music.play(!view.winners.includes(view.you) ? 'lose' : view.winners.length > 1 ? 'notify' : 'win');
                this.recordLocalResult(view);
            }
            return;
        }
        if (this.sending) return;
        music.play(this.myAct(view) && !this.myAct(previous) ? 'turn' : 'notify');
    }

    // おすすめの手を、今の選び方（発電所・金額・買う資源・都市）に入れ、押すボタンを光らせる（押すのは自分）
    showHint() {
        const c = this.myAct() && this.controller?.hint();
        if (!c) {
            music.play('error');
            return;
        }
        music.play('select');
        if (c.type === 'choose' || c.type === 'discard') this.selectedPlant = c.plant;
        if (c.type === 'build') this.selectedCity = c.city;
        this.render();
        if (c.type === 'choose') this.amount = c.bid;
        if (c.type === 'bid') this.amount = c.amount;
        if (c.type === 'buy') this.buy = { coal: c.coal ?? 0, oil: c.oil ?? 0, garbage: c.garbage ?? 0, uranium: c.uranium ?? 0 };
        this.hint = { count: this.view.commandCount, type: c.type };
        this.renderPhase(this.view);
    }

    bindStatic() {
        const segment = (id, key, parse) => $(id).addEventListener('click', (event) => {
            const button = event.target.closest('button[role="radio"]');
            if (!button) return;
            this.settings[key] = parse(button.dataset);
            saveSettings(this.settings);
            this.renderSetup();
        });
        segment('#player-count', 'count', d => Number(d.count));
        segment('#map-choice', 'map', d => d.map);
        segment('#cpu-level', 'level', d => d.level);
        $('#start').addEventListener('click', () => this.newGame());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => {
            if (this.controller?.isOnline) {
                $('#result').close();
                this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
                return;
            }
            this.newGame();
        });
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        $('#online-button').addEventListener('click', () => this.online.open());
        $('#result-board').addEventListener('click', () => $('#result').close());
        // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
        $('#home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#open-log').addEventListener('click', () => this.showLog());
        $('#hint').addEventListener('click', () => this.showHint());
        $('#zoom-in').addEventListener('click', () => this.map.zoomBy(1.6));
        $('#zoom-out').addEventListener('click', () => this.map.zoomBy(1 / 1.6));
        $('#zoom-fit').addEventListener('click', () => this.map.resetZoom());
        $('#market').addEventListener('click', (event) => {
            const el = event.target.closest('[data-plant]');
            if (el) this.pickPlant(Number(el.dataset.plant), 'market');
        });
        $('#mine').addEventListener('click', (event) => {
            const el = event.target.closest('[data-plant]');
            if (el) this.pickPlant(Number(el.dataset.plant), 'mine');
        });
        $('#phase').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (button && !button.disabled) this.act(button.dataset.act, button.dataset);
        });
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
    }

    renderSetup() {
        const check = (id, attr, value) => document.querySelectorAll(`${id} button`).forEach(b => b.setAttribute('aria-checked', String(b.dataset[attr] === String(value))));
        check('#player-count', 'count', this.settings.count);
        check('#map-choice', 'map', this.settings.map);
        check('#cpu-level', 'level', this.settings.level);
    }

    // ---- 操作 ----

    myAct(view = this.view) {
        return view && view.actors.includes(view.you);
    }

    pickPlant(num, where) {
        const view = this.view;
        if (!view) return;
        const a = view.auction;
        const p = num === STEP3 ? null : PLANT[num];
        if (this.myAct(view) && view.phase === 'auction') {
            if (where === 'mine' && a.discard === view.you && num !== a.justBought) {
                this.selectedPlant = this.selectedPlant === num ? null : num;
                this.render();
                return;
            }
            if (where === 'market' && !a.current && a.discard === null && actualMarket(view).includes(num)) {
                this.selectedPlant = this.selectedPlant === num ? null : num;
                this.amountKey = null;
                this.render();
                return;
            }
        }
        if (p) this.toast(`発電所${num}：${TYPE_NAMES[p.type]}${p.need ? `${p.need}つ` : ''}で${p.cities}都市に送電`);
    }

    pickCity(city) {
        const view = this.view;
        const name = MAPS[view.mapId].cities.find(c => c.id === city)?.name ?? city;
        if (view.phase === 'build' && this.myAct(view) && this.buildPick(view)[city] !== undefined) {
            this.selectedCity = this.selectedCity === city ? null : city;
            this.render();
            return;
        }
        const owners = (view.houses[city] ?? []).map(s => view.players[s].name);
        this.toast(owners.length ? `${name}：${owners.join('・')}` : name);
    }

    act(action, data) {
        const view = this.view;
        switch (action) {
            case 'step': {
                const { min, max } = this.amountRange(view);
                this.amount = Math.min(max, Math.max(min, this.amount + Number(data.d)));
                this.renderPhase(view);
                break;
            }
            case 'choose': this.send({ type: 'choose', plant: this.selectedPlant, bid: this.amount }); break;
            case 'skip': this.send({ type: 'skip' }); break;
            case 'bid': this.send({ type: 'bid', amount: this.amount }); break;
            case 'pass': this.send({ type: 'pass' }); break;
            case 'discard': this.send({ type: 'discard', plant: this.selectedPlant }); break;
            case 'res': {
                const t = data.t;
                const next = this.buy[t] + Number(data.d);
                if (next >= 0) this.buy[t] = next;
                this.renderPhase(view);
                break;
            }
            case 'buy': this.send({ type: 'buy', ...this.buy }); break;
            case 'build': if (this.selectedCity) this.send({ type: 'build', city: this.selectedCity }); break;
            case 'done': this.send({ type: 'done' }); break;
        }
    }

    amountRange(view) {
        const money = view.players[view.you].money;
        const a = view.auction;
        if (a?.current) return { min: a.current.high + 1, max: money };
        if (this.selectedPlant !== null) return { min: this.selectedPlant, max: money };
        return { min: 0, max: money };
    }

    buildPick(view) {
        const me = view.players[view.you];
        if (me.cities >= HOUSES) return {};
        return Object.fromEntries(buildOptions(view, view.you).filter(o => o.cost <= me.money).map(o => [o.city, o.cost]));
    }

    // ---- 描画 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        // 手が進んだときだけ、描き直す前の画面を測って、描いたあとに差を動かす
        const prev = this.view;
        const moved = Boolean(prev) && view.commandCount !== prev.commandCount;
        const before = moved ? this.captureMotion() : null;
        this.view = view;
        this.trackEvents(view);
        const a = view.auction;
        const amountKey = a ? `${a.current?.plant ?? this.selectedPlant}:${a.current?.high ?? ''}` : null;
        if (amountKey !== this.amountKey) {
            this.amountKey = amountKey;
            const { min, max } = this.amountRange(view);
            this.amount = Math.min(Math.max(min, 0), Math.max(max, 0));
        }
        const buyKey = view.phase === 'resources' && this.myAct(view) ? `${view.round}` : null;
        if (buyKey !== this.buyKey) {
            this.buyKey = buyKey;
            this.buy = { coal: 0, oil: 0, garbage: 0, uranium: 0 };
        }
        if (view.phase !== 'build' || !this.myAct(view)) this.selectedCity = null;
        this.map.setMap(view.mapId, view.regions);
        const pick = view.phase === 'build' && this.myAct(view) ? this.buildPick(view) : {};
        this.map.render({ houses: view.houses, pick, selected: this.selectedCity });
        this.renderStatus(view);
        this.renderPlayers(view);
        this.renderMarket(view);
        this.renderPhase(view);
        this.renderMine(view);
        if ($('#log').open) this.renderLog();
        if (moved) this.animateMotion(before);
        // 結果の画面は、最後の手の動きが終わってから出す
        if (view.phase === 'end' && !this.resultTimer && !$('#result').open) {
            this.resultTimer = Motion.afterIdle(() => this.showResult(), RESULT_DELAY_MS);
        }
    }

    // 収入のときに、自分の分を知らせる
    trackEvents(view) {
        if (view.commandCount <= this.seenCommands) {
            this.seenCommands = view.commandCount;
            return;
        }
        this.seenCommands = view.commandCount;
        view.events.forEach(event => {
            if (event.type === 'income') this.toast(`収入：${event.powered[view.you]}都市に送電して ${event.incomes[view.you]}`);
            if (event.type === 'step') this.toast(`段階${event.step}になった`);
        });
    }

    name(view, seat) {
        return seat === view.you ? 'あなた' : escapeHtml(view.players[seat].name);
    }

    renderStatus(view) {
        const actor = view.actors[0];
        let who = '';
        if (view.phase !== 'end' && actor !== undefined) who = actor === view.you ? '<span class="who me">あなたの番</span>' : `<span class="who">${this.name(view, actor)}の番</span>`;
        $('#status').innerHTML = `<span class="round">${view.round}巡・段階${view.step}</span><span class="phase-name">${PHASE_NAMES[view.phase] ?? ''}</span>${who}`;
    }

    // ---- 動き（描き直しの前後の差） ----

    // 描き直す前：地図の家・発電所の市場と自分の発電所・各プレイヤーの発電所・数
    captureMotion() {
        return {
            houses: snapshot(document, '#map .house[data-house]', HOUSE_MOTION),
            market: snapshot($('#market'), '[data-plant]', PLANTS),
            mine: snapshot($('#mine'), '[data-plant]', PLANTS),
            owned: snapshot($('#players'), '.pl-plants > i', OWNED),
            amounts: snapshot(document, AMOUNTS, { key: amountKey })
        };
    }

    // 描いたあと：建てた家は地図に現れ（SVG なので大きさは変えない）、競り落とした発電所は市場から自分の欄へ飛ばし、
    // 市場に出た発電所とほかの人が持った発電所ははねて出し、お金・都市・資源の残りの変化を目立たせる
    animateMotion(before) {
        animateDiff(before.houses, document, '#map .house[data-house]', { ...HOUSE_MOTION, enter: el => Motion.fadeIn(el, { duration: 360 }) });
        animateDiff(before.market, $('#market'), '[data-plant]', PLANTS);
        animateDiff(before.mine, $('#mine'), '[data-plant]', { ...PLANTS, enter: (el, num) => flyIn(el, before.market.get(num)?.rect ?? null) });
        animateDiff(before.owned, $('#players'), '.pl-plants > i', OWNED);
        animateDiff(before.amounts, document, AMOUNTS, { key: amountKey });
    }

    renderPlayers(view) {
        $('#players').style.setProperty('--n', view.players.length);
        $('#players').innerHTML = view.order.map(seat => {
            const p = view.players[seat];
            const acting = view.actors.includes(seat);
            return `<div class="pl${acting ? ' acting' : ''}" data-seat="${seat}" style="--c:${PLAYER_COLORS[seat]}">
                <div class="pl-top"><span class="pl-name">${escapeHtml(p.name)}</span><b class="pl-money">${p.money}</b></div>
                <div class="pl-bottom"><span class="pl-cities" title="都市">⌂${p.cities}</span><span class="pl-plants">${p.plants.map(n => `<i>${n}</i>`).join('')}</span></div>
            </div>`;
        }).join('');
    }

    renderMarket(view) {
        const actual = actualMarket(view);
        const can = this.myAct(view) && view.phase === 'auction' && !view.auction.current && view.auction.discard === null;
        const money = view.players[view.you].money;
        $('#market').innerHTML = view.market.map(num => {
            const cls = [actual.includes(num) ? 'actual' : 'future', can && actual.includes(num) && num <= money ? 'can' : '', this.selectedPlant === num && view.auction?.discard === null ? 'sel' : ''].join(' ');
            return plantHtml(num, { cls });
        }).join('');
    }

    renderMine(view) {
        const me = view.players[view.you];
        const discard = view.auction?.discard === view.you;
        $('#mine').innerHTML = (me.plants.length ? me.plants.map(n => plantHtml(n, { stored: this.storedFor(me, n), cls: [discard && n !== view.auction.justBought ? 'can' : '', discard && this.selectedPlant === n ? 'sel' : ''].join(' ') })).join('') : '<span class="none">発電所なし</span>')
            + `<span class="mine-cap">送電 ${capacity(me.plants)}・都市 ${me.cities}<br>山 ${view.deckCount}</span>`;
    }

    // 持っている資源を、発電所ごとに割り振って見せる（実際は持ち主ごとにまとめて持つ）
    storedFor(me, num) {
        const left = { ...me.res };
        for (const n of me.plants) {
            const p = PLANT[n];
            const out = {};
            const types = p.type === 'hybrid' ? ['coal', 'oil'] : p.type === 'eco' ? [] : [p.type];
            let room = p.need * 2;
            types.forEach(t => {
                const k = Math.min(room, left[t]);
                out[t] = k;
                left[t] -= k;
                room -= k;
            });
            if (n === num) return out;
        }
        return {};
    }

    stepper(view) {
        return `<div class="stepper">
            <button class="step" data-act="step" data-d="-5">−5</button><button class="step" data-act="step" data-d="-1">−1</button>
            <span class="amount">${this.amount}</span>
            <button class="step" data-act="step" data-d="1">+1</button><button class="step" data-act="step" data-d="5">+5</button></div>`;
    }

    renderPhase(view) {
        const me = view.players[view.you];
        const a = view.auction;
        let html = '';
        if (view.phase === 'end') html = '<p class="hint">終わり</p>';
        else if (view.phase === 'auction') {
            if (a.current) {
                const c = a.current;
                const info = `<div class="lot">${plantHtml(c.plant)}<span>最高 <b class="big">${c.high}</b> ${this.name(view, c.highBidder)}</span></div>`;
                if (c.turn === view.you) {
                    const { min, max } = this.amountRange(view);
                    html = `${info}<div class="row">${this.stepper(view)}<button class="btn primary" data-act="bid"${min > max ? ' disabled' : ''}>入札</button><button class="btn secondary" data-act="pass">降りる</button></div>`;
                } else html = `${info}<p class="hint">${this.name(view, c.turn)}が考え中</p>`;
            } else if (a.discard === view.you) {
                html = `<p class="hint">持てるのは${view.setup.maxPlants}つまで。手放す発電所を下から選ぶ</p>
                    <div class="row"><button class="btn secondary" data-act="discard"${this.selectedPlant === null ? ' disabled' : ''}>手放す</button></div>`;
            } else if (a.chooser === view.you && a.discard === null) {
                const skip = view.round > 1 ? '<button class="btn secondary" data-act="skip">見送る</button>' : '';
                if (this.selectedPlant === null) html = `<p class="hint">競りにかける発電所を上から選ぶ${view.round === 1 ? '（最初の巡は必ず買う）' : ''}</p><div class="row">${skip}</div>`;
                else {
                    const { min, max } = this.amountRange(view);
                    html = `<div class="lot">${plantHtml(this.selectedPlant)}<span>${this.selectedPlant}から</span></div>
                        <div class="row">${this.stepper(view)}<button class="btn primary" data-act="choose"${min > max ? ' disabled' : ''}>競る</button>${skip}</div>`;
                }
            } else {
                const actor = view.actors[0];
                html = `<p class="hint">${actor === undefined ? '' : `${this.name(view, actor)}が${a.discard !== null ? '手放す発電所を' : '競りにかける発電所を'}選んでいます`}</p>`;
            }
        } else if (view.phase === 'resources') {
            if (this.myAct(view)) {
                const total = RESOURCES.reduce((s, t) => s + (buyPrice(t, view.resources[t], this.buy[t]) ?? 0), 0);
                const after = Object.fromEntries(RESOURCES.map(t => [t, me.res[t] + this.buy[t]]));
                const fits = canStore(me.plants, after);
                const rows = RESOURCES.map(t => {
                    const more = { ...after, [t]: after[t] + 1 };
                    // 入りきらない分と、お金が足りない分は足せない
                    const canMore = this.buy[t] < view.resources[t] && canStore(me.plants, more)
                        && total + (nextPrice(t, view.resources[t] - this.buy[t]) ?? Infinity) <= me.money;
                    const price = nextPrice(t, view.resources[t] - this.buy[t]);
                    return `<div class="res-row">${resIcon(t, 16)}<span class="res-name">${RESOURCE_NAMES[t]}</span><span class="res-left">残${view.resources[t]}・次${price ?? '−'}</span>
                        <button class="step" data-act="res" data-t="${t}" data-d="-1"${this.buy[t] ? '' : ' disabled'}>−</button><b class="res-n">${this.buy[t]}</b><button class="step" data-act="res" data-t="${t}" data-d="1"${canMore ? '' : ' disabled'}>＋</button></div>`;
                }).join('');
                html = `<div class="res-grid">${rows}</div><div class="row"><span class="hint">計 ${total}・所持 ${me.money}</span><button class="btn primary" data-act="buy"${!fits || total > me.money ? ' disabled' : ''}>${total ? '買う' : '買わない'}</button></div>`;
            } else html = `<p class="hint">${this.name(view, view.actors[0])}が資源を買っています</p>${this.resourceSummary(view)}`;
        } else if (view.phase === 'build') {
            if (this.myAct(view)) {
                const pick = this.buildPick(view);
                const city = this.selectedCity;
                const label = city ? `${MAPS[view.mapId].cities.find(c => c.id === city).name}：${pick[city]}` : (Object.keys(pick).length ? '建てる都市を地図で選ぶ（光る都市・数は費用）' : '建てられる都市がない');
                html = `<p class="hint">${label}</p><div class="row"><span class="hint">所持 ${me.money}</span><button class="btn primary" data-act="build"${city ? '' : ' disabled'}>建てる</button><button class="btn secondary" data-act="done">終える</button></div>`;
            } else html = `<p class="hint">${this.name(view, view.actors[0])}が都市を建てています</p>${this.resourceSummary(view)}`;
        }
        $('#phase').innerHTML = html;
        $('#hint').disabled = !this.myAct(view) || view.phase === 'end';
        $('#hint').hidden = Boolean(this.controller?.isOnline); // ヒントはローカル対戦だけ
        if (this.hint && this.hint.count === view.commandCount) $(`#phase [data-act="${this.hint.type}"]`)?.classList.add('recommended');
    }

    resourceSummary(view) {
        return `<div class="res-summary">${RESOURCES.map(t => `<span>${resIcon(t, 14)}${view.resources[t]}<small>（${nextPrice(t, view.resources[t]) ?? '−'}）</small></span>`).join('')}</div>`;
    }

    // ---- ダイアログ ----

    showLog() {
        this.renderLog();
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    renderLog() {
        if (!this.view) return;
        $('#log-list').innerHTML = this.view.logs.map(text => `<li>${escapeHtml(text)}</li>`).join('');
    }

    showResult() {
        const view = this.controller?.getView();
        if (!view) return;
        const won = view.winners.includes(view.you);
        $('#result-title').textContent = won ? (view.winners.length > 1 ? '引き分け（勝ち）' : 'あなたの勝ち') : `${view.winners.map(i => view.players[i].name).join('・')}の勝ち`;
        const order = view.players.map((_, i) => i).sort((x, y) => view.final[y].powered - view.final[x].powered || view.final[y].money - view.final[x].money || view.final[y].cities - view.final[x].cities);
        const rows = order.map(i => {
            const f = view.final[i];
            const cls = [view.winners.includes(i) ? 'win' : '', i === view.you ? 'you' : ''].join(' ');
            return `<tr class="${cls}"><th><span class="dot" style="--c:${PLAYER_COLORS[i]}"></span>${escapeHtml(view.players[i].name)}</th><td class="total">${f.powered}</td><td>${f.cities}</td><td>${f.money}</td></tr>`;
        }).join('');
        $('#result-table').innerHTML = `<table><thead><tr><th></th><th>送電</th><th>都市</th><th>お金</th></tr></thead><tbody>${rows}</tbody></table>
            <p class="note">送電できる都市の数で勝ち負け。同数ならお金、さらに同数なら都市の数。</p>`;
        $('#result').showModal();
    }

    toast(message) {
        const toast = $('#toast');
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
    }
}
