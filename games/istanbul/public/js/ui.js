/**
 * 画面（タイトル・ゲーム・最後の結果・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * 盤の場所をタップして行き先を選び、行動の選択は下の操作の欄か、下から出るシートで答える。長押しで場所の説明を出す
 */

import { MIN_PLAYERS, MAX_PLAYERS, distance, capacityOf, autoSultanAny, postRewards, demandOf, marketPay, blackMarketJewels } from './game.js';
import {
    PLACES, GOODS, GOOD_NAMES, BONUS_CARDS, TILE_NAMES, TILE_TEXTS, MOSQUE_TILES, LAYOUT_NAMES, FOUNTAIN, POLICE,
    GEM_MAX, EXTENSION_COST, MAX_EXTENSIONS, SMALL_PAY, LARGE_PAY
} from './data.js';
import { LEVELS } from './cpu-player.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { getServerUrl } from './online-config.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import * as Motion from './motion/motion.js';
import { GOOD_COLORS, PLAYER_COLORS, goodIcon, anyIcon, rubyIcon, coinIcon, cardIcon, merchantToken, assistantToken, familyToken } from './art.js';

const SETTINGS_KEY = 'istanbul.settings';
const CPU_NAMES = ['アフメト', 'レイラ', 'セリム', 'ギュル'];
const RESULT_DELAY_MS = 900;
const LONG_PRESS_MS = 450;
const FREE_STAGES = ['move', 'pay', 'action', 'after', 'encounter'];
const NEUTRAL_COLOR = '#8d939b';

// 場所の説明
const PLACE_TEXTS = {
    1: '7リラ払って手押し車を広げます（品物ごとに1つ多く積める）。3回目でルビーを1つもらえます。',
    2: '布を、手押し車に積めるだけ積みます。',
    3: '香辛料を、手押し車に積めるだけ積みます。',
    4: '果物を、手押し車に積めるだけ積みます。',
    5: '見えている4マスの品物とリラをもらいます。そのあと印が1つ下り、もらえるものが変わります。',
    6: 'ボーナスカードを2枚引き（捨て札の一番上からも取れる）、手札を1枚捨てます。',
    7: '置いてある助手を、好きなだけ呼び戻します。助手がいなくても行動でき、ほかの商人に払いません。',
    8: '布・香辛料・果物から1つもらい、サイコロ2つを振ります。7〜8で宝石1つ、9〜10で2つ、11〜12で3つ。',
    9: '3〜12の数を言ってサイコロ2つを振ります。合計がその数以上ならその数のリラ、届かなければ2リラ。',
    10: '需要タイルに描かれた品物を1〜5個売ります。1個から 3・7・12・18・25 リラ。売ったらタイルは下へ。',
    11: '需要タイルに描かれた品物を1〜5個売ります。1個から 2・5・9・14・20 リラ。売ったらタイルは下へ。',
    12: '家族がここにいれば、好きな場所へ送って、その場所の行動をします（助手も支払いもいらない）。',
    13: 'ルビーで覆われていないマスの品物をすべて納めて、ルビーを1つもらいます。次は1つ多く要ります。',
    14: '品物がそろっていればタイルを取り、その品物を1つ払います。布のタイル：サイコロを直せる。香辛料のタイル：倉庫で+1。2枚そろうとルビー。',
    15: '品物がそろっていればタイルを取り、その品物を1つ払います。宝石のタイル：5人目の助手。果物のタイル：助手の呼び戻し。2枚そろうとルビー。',
    16: '今の値段のリラを払って、ルビーを1つ買います。買うたびに1リラ上がります。'
};

// 自分の操作の効果音
const COMMAND_SOUNDS = {
    move: 'place', pay: 'pay', act: 'gain', skip: 'cancel', draw: 'draw', discard: 'pay', dice: 'dice', good: 'gain',
    catch: 'gain', governor: 'gain', smuggler: 'gain', bonus: 'gain', yellow: 'gain', end: 'place'
};

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const sum2 = (dice) => dice[0] + dice[1];
// 操作を、項目の順に関係なく比べられる文字列にする
const canonical = (value) => (value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(k => `${k}:${canonical(value[k])}`).join(',')}}`
    : JSON.stringify(value));
// ヒントのボタン（案内の欄の先頭に置く）
const HINT_BUTTON = '<button type="button" id="hint" class="pbtn hint-button" aria-label="ヒント" title="おすすめの手"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg></button>';
// 2つのサイコロで n 以上が出る確率
const chanceAtLeast = (n) => {
    let hit = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b >= n) hit++;
    return hit / 36;
};

function loadSettings() {
    const fallback = { count: 3, level: 'hard', layout: 'short' };
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: Number.isInteger(saved.count) && saved.count >= MIN_PLAYERS && saved.count <= MAX_PLAYERS ? saved.count : fallback.count,
            level: Object.hasOwn(LEVELS, saved.level) ? saved.level : fallback.level,
            layout: Object.hasOwn(LAYOUT_NAMES, saved.layout) ? saved.layout : fallback.layout
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
        this.lastLog = 0;
        this.moveCard = null;      // 移動に使うカード（'move34' | 'stay'）
        this.resultTimer = null;
        this.toastTimer = null;
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'イスタンブール',
            game: 'istanbul',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 700,
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
        this.bindStatic();
        Motion.mountSpeedSetting($('#motion-setting'), { label: '' });
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
        this.view = this.controller.getView();
        this.lastSeq = this.view.events.at(-1)?.seq ?? 0;
        this.lastLog = this.view.logCount;
        this.moveCard = null;
        this.resultTimer?.();
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        if (!this.controller.isOnline) this.controller.scheduleCpu();
        if (this.view.phase === 'end') this.showResult();
    }

    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    goHome() {
        if (this.controller?.isOnline) return this.online.confirmLeave();
        this.showTitle();
    }

    newGame() {
        const { count, level, layout } = this.settings;
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true }))];
        this.startGame({ players, options: { layout }, level });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        this.resultTimer?.();
        ['#result', '#sheet', '#log'].forEach(id => { if ($(id).open) $(id).close(); });
    }

    send(command) {
        if ($('#sheet').open) $('#sheet').close();
        this.sending = command;
        try {
            return this.controller?.send(command);
        } finally {
            this.sending = null;
        }
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#count-down').addEventListener('click', () => this.changeSetting({ count: this.settings.count - 1 }));
        $('#count-up').addEventListener('click', () => this.changeSetting({ count: this.settings.count + 1 }));
        $('#level').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-value]');
            if (button) this.changeSetting({ level: button.dataset.value });
        });
        $('#layout').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-value]');
            if (button) this.changeSetting({ layout: button.dataset.value });
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
        $('#home').addEventListener('click', () => this.goHome());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#open-log').addEventListener('click', () => this.openLog());
        document.querySelectorAll('dialog .close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
        // シートの外をタップしたら閉じる（結果は閉じない）
        document.querySelectorAll('dialog.sheet:not(#result)').forEach(dialog => dialog.addEventListener('click', (event) => {
            if (event.target === dialog) dialog.close();
        }));
        document.addEventListener('contextmenu', (event) => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
        this.bindBoard();
        this.bindPanels();
    }

    changeSetting(change) {
        const next = { ...this.settings, ...change };
        next.count = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, next.count));
        this.settings = next;
        saveSettings(next);
        this.renderSetup();
    }

    renderSetup() {
        const { count, level, layout } = this.settings;
        $('#count-value').textContent = `${count}人`;
        $('#count-down').disabled = count <= MIN_PLAYERS;
        $('#count-up').disabled = count >= MAX_PLAYERS;
        $('#level').innerHTML = Object.entries(LEVELS).map(([key, label]) =>
            `<button data-value="${key}" role="radio" aria-checked="${key === level}" class="${key === level ? 'on' : ''}">${label}</button>`).join('');
        $('#layout').innerHTML = Object.entries(LAYOUT_NAMES).map(([key, label]) =>
            `<button data-value="${key}" role="radio" aria-checked="${key === layout}" class="${key === layout ? 'on' : ''}">${label}</button>`).join('');
    }

    renderTitleArt() {
        $('#title-art').innerHTML = `<div class="title-goods">${GOODS.map(g => goodIcon(g, 'title-good')).join('')}</div>${rubyIcon('title-ruby')}`;
    }

    // ---- 更新 ----

    onUpdate() {
        if (!this.controller) return;
        this.wasMyTurn = !!this.view && this.myTurn() && this.view.phase !== 'end';
        const wasEnd = this.view?.phase === 'end';
        const prev = this.view;
        // 商人・助手・家族の位置は、描き直す前に測る
        const before = Motion.captureRects($('#board'), '.tok[data-key]', 'key');
        this.view = this.controller.getView();
        const view = this.view;
        if (view.turn !== view.you || view.step.stage !== 'move') this.moveCard = null;
        this.announce();
        this.render();
        if (prev) this.animateChanges(prev, view, before);
        if (view.phase === 'end') {
            if (!wasEnd) this.recordLocalResult(view);
            this.resultTimer?.();
            this.resultTimer = Motion.afterIdle(() => this.showResult(), RESULT_DELAY_MS);
        }
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // id はシードから作る（同じ対戦を2回数えない）
    recordLocalResult(view) {
        const controller = this.controller;
        if (!controller || controller.isOnline || controller.game.players.filter(p => !p.isCPU).length !== 1) return;
        recordResult({
            game: 'istanbul',
            id: `istanbul-${controller.game.options.seed}`,
            outcome: outcomeFromWinners(view.winners, view.you, view.players.length)
        });
    }

    // 新しい出来事のうち、サイコロとルビーを短く知らせる
    announce() {
        const view = this.view;
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        this.playSound(fresh, this.wasMyTurn);
        const logs = view.logs;
        const newLogs = logs.slice(Math.max(0, logs.length - (view.logCount - this.lastLog)));
        this.lastLog = view.logCount;
        const notable = newLogs.filter(line => /ルビー|茶屋|闇市|このラウンドで終わり/.test(line));
        if (notable.length > 0 && fresh.length > 0) this.toast(notable.at(-1), 2200);
    }

    // 1つの更新に1つの音。自分の操作は結果の音（サイコロ・ルビーを優先）、相手の手は notify、自分の番になったら turn
    playSound(fresh, wasMyTurn) {
        const view = this.view;
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winners.includes(view.you) ? 'win' : 'lose');
        if (this.sending) {
            const mine = fresh.filter(e => e.seat === view.you);
            if (mine.some(e => e.type === 'ruby')) return music.play('gain');
            if (mine.some(e => e.type === 'dice')) return music.play('dice');
            return music.play(COMMAND_SOUNDS[this.sending.type] ?? 'place');
        }
        if (view.phase !== 'end' && this.myTurn() && !wasMyTurn) return music.play('turn');
        if (fresh.some(e => e.seat !== undefined && e.seat !== view.you)) music.play('notify');
    }

    render() {
        this.renderStatus();
        this.renderOpponents();
        this.renderBoard();
        this.renderPrompt();
        this.renderMe();
        this.markHint();
    }

    // 描き直したあと：前のビューとの差を動かす（商人・助手・家族・総督・密輸人は場所から場所へ滑り、リラ・ルビー・品物・カードの増減は目立つ）
    animateChanges(prev, view, before) {
        if (!Motion.enabled() || !prev.players) return;
        Motion.flipFrom(before, $('#board'), '.tok[data-key]', 'key', { duration: 380, enter: 'pop' });
        const me = view.players[view.you];
        const old = prev.players[view.you];
        if (old) {
            const mine = $('#me');
            if (me.lira !== old.lira) Motion.pulse(mine.querySelector('.me-stat'), { duration: 380, scale: 1.3 });
            if (me.rubies !== old.rubies) Motion.pulse(mine.querySelector('.ruby-stat'), { duration: 420, scale: 1.4 });
            GOODS.forEach((g, i) => {
                if (me.goods[g] !== old.goods[g]) Motion.pulse(mine.querySelectorAll('.cart-cell')[i], { duration: 380, scale: 1.3 });
            });
            if (me.cards.length > old.cards.length) [...mine.querySelectorAll('.hand-card')].slice(old.cards.length).forEach(el => Motion.popIn(el, { duration: 340 }));
        }
        view.players.filter(p => p.id !== view.you).forEach((p, i) => {
            const was = prev.players[p.id];
            const box = $('#opponents').children[i];
            if (!was || !box) return;
            if (p.rubies !== was.rubies) Motion.pulse(box.querySelector('.ruby-stat'), { duration: 420, scale: 1.4 });
            if (p.lira !== was.lira) Motion.pulse(box.querySelectorAll('.opp-stat')[1], { duration: 380, scale: 1.3 });
            GOODS.forEach((g, k) => {
                if (p.goods[g] !== was.goods[g]) Motion.pulse(box.querySelectorAll('.g-num')[k], { duration: 380, scale: 1.4 });
            });
            if (p.cardCount !== was.cardCount) Motion.pulse(box.querySelectorAll('.opp-stat')[2], { duration: 380, scale: 1.3 });
        });
    }

    colorOf(seat) {
        return PLAYER_COLORS[seat % PLAYER_COLORS.length];
    }

    me() {
        return this.view.players[this.view.you];
    }

    myTurn() {
        return this.view.turn === this.view.you;
    }

    renderStatus() {
        const view = this.view;
        const last = view.endTriggered ? '<b class="warn">最後のラウンド</b>' : `ルビー${view.rubyTarget}個で終わり`;
        $('#status').innerHTML = `<span>ラウンド${view.round}</span><span class="sep">·</span><span>${last}</span>`;
    }

    renderOpponents() {
        const view = this.view;
        const others = view.players.filter(p => p.id !== view.you);
        $('#opponents').innerHTML = others.map(p => `
            <div class="opp ${view.turn === p.id ? 'active' : ''}" style="--c:${this.colorOf(p.id)}">
                <span class="opp-dot"></span>
                <span class="opp-name">${escapeHtml(p.name)}</span>
                ${view.turn === p.id ? '<span class="thinking"><i></i><i></i><i></i></span>' : ''}
                <span class="opp-stat ruby-stat">${rubyIcon('mini')}<b>${p.rubies}</b></span>
                <span class="opp-stat">${coinIcon('mini')}<b>${p.lira}</b></span>
                <span class="opp-goods">${GOODS.map(g => `<span class="g-num" style="--g:${GOOD_COLORS[g]}">${p.goods[g]}</span>`).join('')}</span>
                <span class="opp-stat">${cardIcon('mini')}<b>${p.cardCount}</b></span>
            </div>`).join('');
    }

    // ---- 盤 ----

    // 今、盤のどの場所をタップで選べるか（{ place: command } の形）
    boardTargets() {
        const view = this.view;
        const targets = new Map();
        if (!this.myTurn()) return targets;
        const me = this.me();
        const stage = view.step.stage;
        if (stage === 'move') {
            view.layout.forEach(place => {
                const d = distance(view.layout, me.merchant, place);
                if (this.moveCard === 'move34') {
                    if (d >= 3 && d <= 4) targets.set(place, { type: 'move', to: place, card: 'move34' });
                } else if (this.moveCard === 'stay') {
                    if (d === 0) targets.set(place, { type: 'move', to: place, card: 'stay' });
                } else if (d >= 1 && d <= 2) {
                    targets.set(place, { type: 'move', to: place });
                }
            });
        } else if (stage === 'action' && view.step.actPlace === POLICE && view.step.via === 'merchant') {
            view.layout.forEach(place => { if (place !== POLICE) targets.set(place, { type: 'act', to: place }); });
        }
        return targets;
    }

    renderBoard() {
        const view = this.view;
        const targets = this.boardTargets();
        const me = this.me();
        $('#board').innerHTML = view.layout.map(place => {
            const classes = ['tile', `p${place}`];
            if (targets.has(place)) classes.push('target');
            if (view.step.actPlace === place && ['action', 'caravan', 'caravanDiscard', 'dice', 'blackGood', 'after'].includes(view.step.stage)) classes.push('acting');
            if (me.merchant === place) classes.push('mine');
            const extra = targets.has(place) ? this.costHint(place) : '';
            return `<button class="${classes.join(' ')}" data-place="${place}">
                <span class="t-head"><span class="t-no">${place}</span><span class="t-name">${PLACES[place].short}</span></span>
                <span class="t-info">${this.placeInfo(place)}</span>
                <span class="t-toks">${this.tokensAt(place)}</span>
                ${extra}
            </button>`;
        }).join('');
    }

    // 行き先のタイルに出す、払うリラの目安
    costHint(place) {
        const view = this.view;
        if (view.step.stage !== 'move' || place === FOUNTAIN) return '';
        const others = view.players.filter(p => p.id !== view.you && p.merchant === place).length + view.neutrals.filter(x => x === place).length;
        return others > 0 ? `<span class="t-cost">−${others * 2}</span>` : '';
    }

    // 場所ごとの今の状態（値段・要る品物など）
    placeInfo(place) {
        const view = this.view;
        switch (place) {
            case 1: return `${coinIcon('ic')}<b>${EXTENSION_COST}</b>`;
            case 2: case 3: case 4: return `${goodIcon(PLACES[place].good, 'ic')}<small>max</small>`;
            case 5: return `<span class="post">${postRewards(view.post).map(r => (r.lira ? `<i class="pl">${r.lira}</i>` : goodIcon(r.good, 'ic s'))).join('')}</span>`;
            case 6: return `${cardIcon('ic')}<small>${view.discardTop ? BONUS_CARDS[view.discardTop].name : ''}</small>`;
            case 8: return `${anyIcon('ic s')}<small>＋サイコロ</small>`;
            case 9: return '<small>3〜12に賭ける</small>';
            case 10: case 11: {
                const demand = demandOf(place, view.demand[place === 10 ? 'large' : 'small']);
                return `<span class="demand">${GOODS.flatMap(g => Array(demand[g]).fill(goodIcon(g, 'ic xs'))).join('')}</span>`;
            }
            case 13: {
                const need = view.sultanNeed;
                if (!need) return '<small>売り切れ</small>';
                return `<span class="demand">${GOODS.flatMap(g => Array(need[g]).fill(goodIcon(g, 'ic xs'))).join('')}${Array(need.any).fill(anyIcon('ic xs')).join('')}</span>`;
            }
            case 14: case 15:
                return `<span class="mosque">${MOSQUE_TILES[place].map(c => {
                    const top = view.mosqueTiles[c][0];
                    return `<span class="mq">${goodIcon(c, 'ic s')}<b>${top ?? '−'}</b></span>`;
                }).join('')}<span class="mq">${rubyIcon('ic s')}<b>${view.mosqueRubies[place]}</b></span></span>`;
            case 16: return view.gemPrice <= GEM_MAX ? `${rubyIcon('ic')}<b>${view.gemPrice}</b>` : '<small>売り切れ</small>';
            default: return '';
        }
    }

    tokensAt(place) {
        const view = this.view;
        const parts = [];
        // 動かす駒には data-key を付ける（FLIP で前の位置から動かすため）
        const keyed = (html, key) => html.replace('<span ', `<span data-key="${key}" `);
        view.players.forEach(p => {
            if (p.merchant === place) parts.push(keyed(merchantToken(this.colorOf(p.id), p.stack, `tok merchant${p.id === view.you ? ' you' : ''}`), `m${p.id}`));
        });
        view.neutrals.forEach((x, i) => { if (x === place) parts.push(`<span data-key="n${i}" class="tok merchant neutral" style="--c:${NEUTRAL_COLOR}"></span>`); });
        view.players.forEach(p => {
            p.assistants.forEach((x, i) => { if (x === place) parts.push(keyed(assistantToken(this.colorOf(p.id)), `a${p.id}-${i}`)); });
        });
        view.players.forEach(p => { if (p.family === place) parts.push(keyed(familyToken(this.colorOf(p.id)), `f${p.id}`)); });
        if (view.governor === place) parts.push('<span data-key="gov" class="tok npc gov">総</span>');
        if (view.smuggler === place) parts.push('<span data-key="smug" class="tok npc smug">密</span>');
        return parts.join('');
    }

    bindBoard() {
        const board = $('#board');
        let timer = null;
        let pressed = null;
        let longPressed = false;
        board.addEventListener('pointerdown', (event) => {
            const tile = event.target.closest('.tile');
            if (!tile) return;
            pressed = tile;
            longPressed = false;
            clearTimeout(timer);
            timer = setTimeout(() => {
                longPressed = true;
                this.openPlaceInfo(Number(tile.dataset.place));
            }, LONG_PRESS_MS);
        });
        const cancel = () => clearTimeout(timer);
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => board.addEventListener(type, cancel));
        board.addEventListener('click', (event) => {
            const tile = event.target.closest('.tile');
            if (!tile || longPressed || tile !== pressed && pressed) {
                longPressed = false;
                return;
            }
            this.tapPlace(Number(tile.dataset.place));
        });
        board.addEventListener('contextmenu', (event) => {
            const tile = event.target.closest('.tile');
            if (!tile) return;
            event.preventDefault();
            clearTimeout(timer);
            if (!longPressed) this.openPlaceInfo(Number(tile.dataset.place));
            longPressed = true;
        });
    }

    tapPlace(place) {
        const command = this.boardTargets().get(place);
        if (command) {
            this.send(command);
            return;
        }
        this.openPlaceInfo(place);
    }

    openPlaceInfo(place) {
        const view = this.view;
        const here = [];
        view.players.forEach(p => {
            if (p.merchant === place) here.push(`${escapeHtml(p.name)}の商人`);
            const n = p.assistants.filter(x => x === place).length;
            if (n > 0) here.push(`${escapeHtml(p.name)}の助手${n > 1 ? `×${n}` : ''}`);
            if (p.family === place) here.push(`${escapeHtml(p.name)}の家族`);
        });
        if (view.neutrals.includes(place)) here.push('中立の商人');
        if (view.governor === place) here.push('総督');
        if (view.smuggler === place) here.push('密輸人');
        let detail = '';
        if (place === 10 || place === 11) {
            const pay = place === 10 ? LARGE_PAY : SMALL_PAY;
            detail = `<p class="muted">今の需要：${this.placeInfo(place)}</p><p class="muted">売り上げ：${pay.slice(1).map((v, i) => `${i + 1}個 ${v}`).join('・')}</p>`;
        } else if (place === 13 && view.sultanNeed) {
            detail = `<p class="muted">次のルビーに要る品物：${this.placeInfo(place)}</p>`;
        } else if (place === 14 || place === 15) {
            detail = MOSQUE_TILES[place].map(c => `<p class="muted">${goodIcon(c, 'ic s')} ${TILE_NAMES[c]}（${GOOD_NAMES[c]}${view.mosqueTiles[c][0] ?? '−'}個）：${TILE_TEXTS[c]}</p>`).join('')
                + `<p class="muted">残りのルビー：${view.mosqueRubies[place]}</p>`;
        } else if (place === 16) {
            detail = `<p class="muted">今の値段：${view.gemPrice <= GEM_MAX ? `${view.gemPrice}リラ` : '売り切れ'}</p>`;
        } else if (place === 5) {
            detail = `<p class="muted">今もらえるもの：${this.placeInfo(place)}</p>`;
        }
        this.openSheet({
            title: `${place}. ${PLACES[place].name}`,
            body: `<p>${PLACE_TEXTS[place]}</p>${detail}<p class="muted">${here.length ? `ここにいる：${here.join('・')}` : ''}</p>`,
            buttons: [{ label: '閉じる', cls: 'secondary' }]
        });
    }

    // ---- 操作の欄 ----

    setPrompt(text, buttons = []) {
        $('#prompt-text').innerHTML = text;
        const box = $('#prompt-buttons');
        // 自分の番には、ヒントのボタンを先に置く
        // ヒントはローカル対戦だけ
        const hint = this.view?.phase !== 'end' && this.view && this.myTurn() && !this.controller?.isOnline ? HINT_BUTTON : '';
        box.innerHTML = hint + buttons.map((b, i) => `<button class="pbtn ${b.cls ?? ''}" data-i="${i}" ${b.disabled ? 'disabled' : ''}>${b.label}</button>`).join('');
        this.promptActions = buttons.map(b => b.onClick);
        this.promptCommands = buttons.map(b => b.command ?? null);
    }

    // ヒントが指す場面（手を打つと変わる）
    hintKey() {
        const v = this.view;
        return JSON.stringify([v.round, v.turn, v.step, v.logCount]);
    }

    // おすすめの手を光らせる（行き先の場所か、案内の欄のボタン）
    showHint() {
        if (!this.myTurn()) return;
        const command = this.controller?.isOnline ? null : this.controller?.suggest();
        if (!command) return;
        music.play('select');
        this.hint = { at: this.hintKey(), command };
        if (command.type === 'move') this.moveCard = command.card ?? null;
        this.render();
    }

    markHint() {
        if (!this.hint || this.hint.at !== this.hintKey()) {
            this.hint = null;
            return;
        }
        const c = this.hint.command;
        if ((c.type === 'move' || (c.type === 'act' && c.to !== undefined)) && this.boardTargets().has(c.to)) {
            $(`#board [data-place="${c.to}"]`)?.classList.add('suggested');
            return;
        }
        // 同じ操作のボタン。なければ（品物を選ぶシートなど）、同じ種類の操作のボタン
        const same = (a, b) => canonical(a) === canonical(b);
        let index = this.promptCommands.findIndex(x => x && same(x, c));
        if (index < 0) index = this.promptCommands.findIndex((x, i) => x?.type === c.type || (c.type === 'act' && !x && this.promptActions[i]));
        if (index >= 0) $(`#prompt-buttons [data-i="${index}"]`)?.classList.add('suggested');
    }

    renderPrompt() {
        const view = this.view;
        if (view.phase === 'end') {
            this.setPrompt('ゲームが終わりました', [{ label: '結果を見る', cls: 'primary', onClick: () => this.showResult() }]);
            return;
        }
        if (!this.myTurn()) {
            const p = view.players[view.turn];
            const logs = view.logs;
            this.setPrompt(`<b style="color:${this.colorOf(p.id)}">${escapeHtml(p.name)}</b>の番　<span class="muted">${escapeHtml(logs.at(-1) ?? '')}</span>`);
            return;
        }
        const me = this.me();
        const step = view.step;
        switch (step.stage) {
            case 'move': {
                const buttons = [];
                if (this.moveCard) {
                    buttons.push({ label: 'カードを使わない', onClick: () => { this.moveCard = null; this.render(); } });
                } else {
                    if (me.cards.includes('move34')) buttons.push({ label: '遠くへ（3〜4マス）', onClick: () => { this.moveCard = 'move34'; this.render(); } });
                    if (me.cards.includes('stay') && me.stack > 0) buttons.push({ label: '居残り', onClick: () => { this.moveCard = 'stay'; this.render(); } });
                }
                const text = this.moveCard === 'move34' ? '3〜4マス先の場所を選んでください'
                    : this.moveCard === 'stay' ? '今の場所をタップすると、ここでもう一度行動します'
                        : me.stack === 0 ? '<b>あなたの番</b>：連れている助手がいません。噴水か、助手のいる場所へ'
                            : '<b>あなたの番</b>：光っている場所へ動かします';
                this.setPrompt(text, buttons);
                return;
            }
            case 'pay': {
                const cost = step.payCost;
                this.setPrompt(`ほかの商人に<b>${cost}リラ</b>払って行動しますか`, [
                    { label: `${cost}リラ払う`, cls: 'primary', disabled: me.lira < cost, command: { type: 'pay', accept: true }, onClick: () => this.send({ type: 'pay', accept: true }) },
                    { label: '払わずに番を終える', command: { type: 'pay', accept: false }, onClick: () => this.send({ type: 'pay', accept: false }) }
                ]);
                return;
            }
            case 'action': this.actionPrompt(); return;
            case 'caravan': {
                const buttons = [{ label: '山札から', cls: 'primary', disabled: view.deckCount + view.discardCount === 0, command: { type: 'draw', from: 'deck' }, onClick: () => this.send({ type: 'draw', from: 'deck' }) }];
                if (view.discardTop) buttons.push({ label: `捨て札の「${BONUS_CARDS[view.discardTop].name}」`, command: { type: 'draw', from: 'discard' }, onClick: () => this.send({ type: 'draw', from: 'discard' }) });
                this.setPrompt(`隊商宿：カードを引きます（あと${step.draws}枚）`, buttons);
                return;
            }
            case 'caravanDiscard':
                this.setPrompt('隊商宿：捨てるカードを1枚選んでください', me.cards.map((card, index) => ({
                    label: BONUS_CARDS[card].name, command: { type: 'discard', index }, onClick: () => this.send({ type: 'discard', index })
                })));
                return;
            case 'dice': {
                const [a, b] = step.dice;
                const what = step.diceFor === 'tea' ? `${step.bet}に賭けて` : '闇市で';
                this.setPrompt(`${what}<b>${a}・${b}</b>（合計${a + b}）。赤のタイルで直せます`, [
                    { label: 'このまま', cls: 'primary', command: { type: 'dice', mode: 'keep' }, onClick: () => this.send({ type: 'dice', mode: 'keep' }) },
                    { label: '振り直す', command: { type: 'dice', mode: 'reroll' }, onClick: () => this.send({ type: 'dice', mode: 'reroll' }) },
                    { label: `${a}を4に`, disabled: a === 4, command: { type: 'dice', mode: 'four', die: 0 }, onClick: () => this.send({ type: 'dice', mode: 'four', die: 0 }) },
                    { label: `${b}を4に`, disabled: b === 4, command: { type: 'dice', mode: 'four', die: 1 }, onClick: () => this.send({ type: 'dice', mode: 'four', die: 1 }) }
                ]);
                return;
            }
            case 'blackGood': {
                const cap = capacityOf(me);
                const dice = step.dice;
                this.setPrompt(`闇市：<b>${dice[0]}・${dice[1]}</b>で宝石${blackMarketJewels(sum2(dice))}つ。品物を1つ選んでください`,
                    ['red', 'green', 'yellow'].map(g => ({
                        label: `${goodIcon(g, 'ic s')}${GOOD_NAMES[g]}`, disabled: me.goods[g] >= cap, command: { type: 'good', good: g }, onClick: () => this.send({ type: 'good', good: g })
                    })));
                return;
            }
            case 'after': {
                const names = { sultan2: '宮殿でもう1回', post2: '郵便局でもう1回', gem2: '宝石商でもう1回' };
                const buttons = Object.entries(names).filter(([card]) => me.cards.includes(card) && this.doubleUsable(card))
                    .map(([card, label]) => ({ label, cls: 'primary', command: { type: 'bonus', card }, onClick: () => this.send({ type: 'bonus', card }) }));
                buttons.push({ label: '次へ', command: { type: 'end' }, onClick: () => this.send({ type: 'end' }) });
                this.setPrompt('カードで、もう1回行動できます', buttons);
                return;
            }
            case 'encounter': this.encounterPrompt(); return;
            default: this.setPrompt('');
        }
    }

    doubleUsable(card) {
        const view = this.view;
        return { sultan2: 13, post2: 5, gem2: 16 }[card] === view.step.actPlace && view.step.via === 'merchant';
    }

    actionPrompt() {
        const view = this.view;
        const me = this.me();
        const place = view.step.actPlace;
        const cap = capacityOf(me);
        const skip = { label: '行動しない', command: { type: 'skip' }, onClick: () => this.send({ type: 'skip' }) };
        const act = (params = {}) => this.send({ type: 'act', ...params });
        const head = `<b>${PLACES[place].name}</b>${view.step.via === 'family' ? '（家族で）' : ''}：`;
        switch (place) {
            case 1:
                this.setPrompt(`${head}7リラで広げると、品物ごとに${cap + 1}つまで積めます${me.ext === MAX_EXTENSIONS - 1 ? '（ルビーも）' : ''}`, [
                    { label: '広げる', cls: 'primary', disabled: me.lira < EXTENSION_COST || me.ext >= MAX_EXTENSIONS, command: { type: 'act' }, onClick: () => act() }, skip]);
                return;
            case 2: case 3: case 4: {
                const good = PLACES[place].good;
                const buttons = [{ label: `${GOOD_NAMES[good]}を積む`, cls: 'primary', command: { type: 'act' }, onClick: () => act() }];
                if (me.tiles.includes('green') && me.lira >= 2) buttons.push({ label: '積む＋2リラで1つ', onClick: () => this.openExtraSheet(good) });
                buttons.push(skip);
                this.setPrompt(`${head}${GOOD_NAMES[good]}を${cap}つまで積みます（今${me.goods[good]}）`, buttons);
                return;
            }
            case 5: {
                const rewards = postRewards(view.post).map(r => (r.lira ? `${r.lira}リラ` : GOOD_NAMES[r.good])).join('・');
                this.setPrompt(`${head}${rewards}`, [{ label: '受け取る', cls: 'primary', command: { type: 'act' }, onClick: () => act() }, skip]);
                return;
            }
            case 6: this.setPrompt(`${head}カードを2枚引いて、1枚捨てます`, [{ label: 'カードを引く', cls: 'primary', command: { type: 'act' }, onClick: () => act() }, skip]); return;
            case 7: this.setPrompt(`${head}置いた助手${me.assistants.length}人を呼び戻します`, [
                { label: '全員戻す', cls: 'primary', disabled: me.assistants.length === 0, command: { type: 'act' }, onClick: () => act() }, skip]);
                return;
            case 8: this.setPrompt(`${head}サイコロを振って宝石、そのあと品物を1つ`, [{ label: 'サイコロを振る', cls: 'primary', command: { type: 'act' }, onClick: () => act() }, skip]); return;
            case 9: this.setPrompt(`${head}数を決めてサイコロを振ります`, [{ label: '賭ける', cls: 'primary', onClick: () => this.openTeaSheet() }, skip]); return;
            case 10: case 11: this.setPrompt(`${head}需要の品物を売ります`, [{ label: '売る', cls: 'primary', onClick: () => this.openMarketSheet(place) }, skip]); return;
            case 12: this.setPrompt(`${head}家族を送る場所を、盤から選んでください`, [skip]); return;
            case 13: {
                const need = view.sultanNeed;
                const picks = need && GOODS.every(g => me.goods[g] >= need[g]) ? autoSultanAny(me.goods, need) : null;
                this.setPrompt(`${head}品物を納めてルビーを1つもらいます`, [{ label: '納める', cls: 'primary', disabled: !picks, command: { type: 'act' }, onClick: () => act() }, skip]);
                return;
            }
            case 14: case 15: {
                const buttons = MOSQUE_TILES[place].map(c => {
                    const top = view.mosqueTiles[c][0];
                    const ok = top !== undefined && !me.tiles.includes(c) && me.goods[c] >= top;
                    return { label: `${goodIcon(c, 'ic s')}${TILE_NAMES[c]}`, cls: ok ? 'primary' : '', disabled: !ok, command: { type: 'act', ...{ tile: c } }, onClick: () => act({ tile: c }) };
                });
                buttons.push(skip);
                this.setPrompt(`${head}タイルを取って、その品物を1つ払います`, buttons);
                return;
            }
            case 16:
                this.setPrompt(`${head}${view.gemPrice}リラでルビーを買います`, [
                    { label: '買う', cls: 'primary', disabled: view.gemPrice > GEM_MAX || me.lira < view.gemPrice, command: { type: 'act' }, onClick: () => act() }, skip]);
                return;
            default: this.setPrompt(head, [skip]);
        }
    }

    encounterPrompt() {
        const view = this.view;
        const me = this.me();
        const encounter = view.step.encounters[0];
        if (encounter.kind === 'family') {
            const name = escapeHtml(view.players[encounter.seat].name);
            this.setPrompt(`${name}の家族を警察署へ送ります。ごほうびは？`, [
                { label: '3リラ', cls: 'primary', command: { type: 'catch', reward: 'lira' }, onClick: () => this.send({ type: 'catch', reward: 'lira' }) },
                { label: 'カード1枚', disabled: view.deckCount + view.discardCount === 0, command: { type: 'catch', reward: 'card' }, onClick: () => this.send({ type: 'catch', reward: 'card' }) }
            ]);
        } else if (encounter.kind === 'governor') {
            const none = view.deckCount + view.discardCount === 0;
            this.setPrompt('総督：カードを1枚もらえます（2リラか手札1枚を払う）', [
                { label: '2リラ払う', cls: 'primary', disabled: none || me.lira < 2, command: { type: 'governor', use: true, pay: 'lira' }, onClick: () => this.send({ type: 'governor', use: true, pay: 'lira' }) },
                { label: '手札と交換', disabled: none || me.cards.length === 0, onClick: () => this.openGovernorSheet() },
                { label: 'もらわない', command: { type: 'governor', use: false }, onClick: () => this.send({ type: 'governor', use: false }) }
            ]);
        } else {
            this.setPrompt('密輸人：好きな品物を1つもらえます（2リラか品物1つを払う）', [
                { label: 'もらう', cls: 'primary', onClick: () => this.openSmugglerSheet() },
                { label: 'もらわない', command: { type: 'smuggler', use: false }, onClick: () => this.send({ type: 'smuggler', use: false }) }
            ]);
        }
    }

    // ---- 自分の欄 ----

    renderMe() {
        const view = this.view;
        const me = this.me();
        const cap = capacityOf(me);
        const free = this.myTurn() && FREE_STAGES.includes(view.step.stage);
        $('#me').style.setProperty('--c', this.colorOf(me.id));
        $('#me').classList.toggle('active', this.myTurn());
        $('#me').innerHTML = `
            <div class="me-row">
                <span class="cart">${GOODS.map(g => `<span class="cart-cell">${goodIcon(g, 'ic')}<b>${me.goods[g]}</b><small>/${cap}</small></span>`).join('')}</span>
                <span class="me-stat">${coinIcon('ic')}<b>${me.lira}</b></span>
                <span class="me-stat ruby-stat">${rubyIcon('ic')}<b>${me.rubies}</b><small>/${view.rubyTarget}</small></span>
            </div>
            <div class="me-row">
                <span class="me-stat helpers" title="連れている助手・置いた助手">${merchantToken(this.colorOf(me.id), me.stack, 'tok merchant you')}<small>置いた${me.assistants.length}</small></span>
                ${me.tiles.map(t => `<button class="tile-chip" data-tile="${t}" ${t === 'yellow' && free && !view.step.yellowUsed ? '' : ''}>${goodIcon(t, 'ic s')}</button>`).join('')}
                <span class="hand">${me.cards.map((card, i) => `<button class="hand-card ${free ? 'usable' : ''}" data-index="${i}">${BONUS_CARDS[card].name}</button>`).join('') || '<span class="muted small">カードなし</span>'}</span>
            </div>`;
    }

    bindPanels() {
        $('#prompt-buttons').addEventListener('click', (event) => {
            if (event.target.closest('#hint')) return this.showHint();
            const button = event.target.closest('button[data-i]');
            if (button && !button.disabled) this.promptActions?.[Number(button.dataset.i)]?.();
        });
        $('#me').addEventListener('click', (event) => {
            const card = event.target.closest('.hand-card');
            if (card) {
                this.openCardSheet(Number(card.dataset.index));
                return;
            }
            const tile = event.target.closest('.tile-chip');
            if (tile) this.openTileSheet(tile.dataset.tile);
        });
    }

    // ---- シート ----

    openSheet({ title, body, buttons = [], bind }) {
        $('#sheet-title').innerHTML = title;
        $('#sheet-body').innerHTML = body;
        $('#sheet-buttons').innerHTML = buttons.map((b, i) => `<button class="btn ${b.cls ?? 'secondary'}" data-i="${i}" ${b.disabled ? 'disabled' : ''}>${b.label}</button>`).join('');
        $('#sheet-buttons').onclick = (event) => {
            const button = event.target.closest('button[data-i]');
            if (!button) return;
            const action = buttons[Number(button.dataset.i)].onClick;
            if (action) action();
            else $('#sheet').close();
        };
        bind?.($('#sheet-body'));
        if (!$('#sheet').open) $('#sheet').showModal();
    }

    // 選ぶボタンの並び（シートの中）
    choiceRow(name, items, selected) {
        return `<div class="choice-row" data-name="${name}">${items.map(item =>
            `<button class="chip ${item.value === selected ? 'on' : ''}" data-value="${item.value}" ${item.disabled ? 'disabled' : ''}>${item.label}</button>`).join('')}</div>`;
    }

    openTeaSheet() {
        const items = Array.from({ length: 10 }, (_, i) => i + 3);
        this.openSheet({
            title: '茶屋：いくつに賭けますか',
            body: `<p class="muted">合計がその数以上ならその数のリラ、届かなければ2リラ。（ ）は届く見込み</p>
                <div class="bet-grid">${items.map(n => `<button class="chip bet" data-bet="${n}"><b>${n}</b><small>${Math.round(chanceAtLeast(n) * 100)}%</small></button>`).join('')}</div>`,
            buttons: [{ label: 'やめる', cls: 'secondary' }],
            bind: (body) => body.querySelectorAll('[data-bet]').forEach(button => button.addEventListener('click', () => {
                this.send({ type: 'act', bet: Number(button.dataset.bet) });
            }))
        });
    }

    openMarketSheet(place) {
        const view = this.view;
        const me = this.me();
        const demand = demandOf(place, view.demand[place === 10 ? 'large' : 'small']);
        const canAny = place === 11 && me.cards.includes('market');
        // 需要に合う品物がなく、カードでだけ売れるときは、はじめからカードを使う形にする
        const state = { any: canAny && GOODS.every(g => Math.min(me.goods[g], demand[g]) === 0), sell: { red: 0, green: 0, yellow: 0, blue: 0 } };
        const limit = (g) => (state.any ? me.goods[g] : Math.min(me.goods[g], demand[g]));
        const total = () => GOODS.reduce((s, g) => s + state.sell[g], 0);
        // はじめは売れるだけ売る形にしておく
        GOODS.forEach(g => { state.sell[g] = Math.min(limit(g), 5 - total()); });
        const draw = () => {
            const n = total();
            this.openSheet({
                title: `${PLACES[place].name}で売る`,
                body: `<div class="market">${GOODS.map(g => `
                    <div class="m-row"><span class="m-good">${goodIcon(g, 'ic')}${GOOD_NAMES[g]}<small>需要${demand[g]}・持ち${me.goods[g]}</small></span>
                    <span class="stepper"><button class="step-btn" data-g="${g}" data-d="-1" ${state.sell[g] <= 0 ? 'disabled' : ''}>−</button>
                    <span class="count-value">${state.sell[g]}</span>
                    <button class="step-btn" data-g="${g}" data-d="1" ${state.sell[g] >= limit(g) || n >= 5 ? 'disabled' : ''}>＋</button></span></div>`).join('')}
                    ${canAny ? `<label class="any-toggle"><input type="checkbox" id="any-goods" ${state.any ? 'checked' : ''}> 「何でも売る」のカードを使う</label>` : ''}
                    <p class="m-total">${n}個で <b>${marketPay(place, n)}リラ</b></p></div>`,
                buttons: [
                    { label: '売る', cls: 'primary', disabled: n === 0, command: { type: 'act', sell: { ...state.sell }, ...(state.any ? { card: 'market' } : {}) }, onClick: () => this.send({ type: 'act', sell: { ...state.sell }, ...(state.any ? { card: 'market' } : {}) }) },
                    { label: 'やめる', cls: 'secondary' }
                ],
                bind: (body) => {
                    body.querySelectorAll('[data-g]').forEach(button => button.addEventListener('click', () => {
                        state.sell[button.dataset.g] += Number(button.dataset.d);
                        draw();
                    }));
                    body.querySelector('#any-goods')?.addEventListener('change', (event) => {
                        state.any = event.target.checked;
                        GOODS.forEach(g => { state.sell[g] = Math.min(state.sell[g], limit(g)); });
                        draw();
                    });
                }
            });
        };
        draw();
    }

    openExtraSheet(good) {
        const me = this.me();
        const cap = capacityOf(me);
        this.openSheet({
            title: '2リラで足す品物',
            body: `<p class="muted">${GOOD_NAMES[good]}を積んだあと、2リラ払って好きな品物を1つ足します</p>`
                + this.choiceRow('extra', GOODS.filter(g => g !== good).map(g => ({ value: g, label: `${goodIcon(g, 'ic s')}${GOOD_NAMES[g]}`, disabled: me.goods[g] >= cap }))),
            buttons: [{ label: 'やめる', cls: 'secondary' }],
            bind: (body) => body.querySelectorAll('.chip').forEach(button => button.addEventListener('click', () => {
                this.send({ type: 'act', extra: button.dataset.value });
            }))
        });
    }

    openGovernorSheet() {
        const me = this.me();
        this.openSheet({
            title: '総督：手札のどれと交換しますか',
            body: this.choiceRow('card', me.cards.map((card, i) => ({ value: i, label: BONUS_CARDS[card].name }))),
            buttons: [{ label: 'やめる', cls: 'secondary' }],
            bind: (body) => body.querySelectorAll('.chip').forEach(button => button.addEventListener('click', () => {
                this.send({ type: 'governor', use: true, pay: 'card', index: Number(button.dataset.value) });
            }))
        });
    }

    openSmugglerSheet() {
        const me = this.me();
        const cap = capacityOf(me);
        const state = { good: GOODS.find(g => me.goods[g] < cap) ?? null, pay: me.lira >= 2 ? 'lira' : null };
        const draw = () => {
            const after = { ...me.goods };
            if (state.good) after[state.good]++;
            const payItems = [{ value: 'lira', label: '2リラ', disabled: me.lira < 2 },
                ...GOODS.map(g => ({ value: g, label: `${goodIcon(g, 'ic s')}${GOOD_NAMES[g]}`, disabled: after[g] < 1 }))];
            if (state.pay && payItems.find(i => i.value === state.pay)?.disabled) state.pay = null;
            this.openSheet({
                title: '密輸人',
                body: `<p class="muted">もらう品物</p>${this.choiceRow('good', GOODS.map(g => ({ value: g, label: `${goodIcon(g, 'ic s')}${GOOD_NAMES[g]}`, disabled: me.goods[g] >= cap })), state.good)}
                    <p class="muted">払うもの</p>${this.choiceRow('pay', payItems, state.pay)}`,
                buttons: [
                    { label: 'もらう', cls: 'primary', disabled: !state.pay, command: { type: 'smuggler', use: true, good: state.good, pay: state.pay }, onClick: () => this.send({ type: 'smuggler', use: true, good: state.good, pay: state.pay }) },
                    { label: 'やめる', cls: 'secondary' }
                ],
                bind: (body) => body.querySelectorAll('.chip').forEach(button => button.addEventListener('click', () => {
                    state[button.closest('.choice-row').dataset.name] = button.dataset.value;
                    draw();
                }))
            });
        };
        draw();
    }

    openCardSheet(index) {
        const view = this.view;
        const me = this.me();
        const card = me.cards[index];
        if (!card) return;
        const info = BONUS_CARDS[card];
        const free = this.myTurn() && FREE_STAGES.includes(view.step.stage);
        const cap = capacityOf(me);
        const use = (params) => this.send({ type: 'bonus', card, ...params });
        let body = `<p>${info.text}</p>`;
        let buttons = [];
        let bind;
        if (!free) {
            body += `<p class="muted">${this.myTurn() ? '行動の途中では使えません' : '自分の番に使えます'}</p>`;
        } else if (card === 'lira5') {
            buttons = [{ label: '使う', cls: 'primary', onClick: () => use({}) }];
        } else if (card === 'good') {
            body += this.choiceRow('good', GOODS.map(g => ({ value: g, label: `${goodIcon(g, 'ic s')}${GOOD_NAMES[g]}`, disabled: me.goods[g] >= cap })));
            bind = (el) => el.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => use({ good: b.dataset.value })));
        } else if (card === 'return') {
            body += me.assistants.length ? this.choiceRow('from', [...new Set(me.assistants)].map(x => ({ value: x, label: PLACES[x].short })))
                : '<p class="muted">置いてある助手がいません</p>';
            bind = (el) => el.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => use({ from: Number(b.dataset.value) })));
        } else if (card === 'family') {
            const away = me.family !== POLICE;
            body += `<p class="muted">${away ? `家族は今「${PLACES[me.family].short}」にいます` : '家族は警察署にいます'}</p>`;
            buttons = [
                { label: '3リラ', cls: 'primary', disabled: !away, onClick: () => use({ reward: 'lira' }) },
                { label: 'カード1枚', disabled: !away, onClick: () => use({ reward: 'card' }) }
            ];
        } else if (card === 'move34' || card === 'stay') {
            const ok = view.step.stage === 'move' && (card === 'move34' || me.stack > 0);
            body += `<p class="muted">${ok ? '使うと、盤で行き先を選べます' : '移動のときに使います'}</p>`;
            if (ok) buttons = [{ label: '使う', cls: 'primary', onClick: () => { $('#sheet').close(); this.moveCard = card; this.render(); } }];
        } else if (card === 'market') {
            body += '<p class="muted">小市場で「売る」を選ぶと使えます</p>';
        } else {
            const ok = view.step.stage === 'after' && this.doubleUsable(card);
            body += `<p class="muted">${ok ? '' : 'その場所で行動したあとに使えます'}</p>`;
            if (ok) buttons = [{ label: '使う', cls: 'primary', onClick: () => use({}) }];
        }
        buttons.push({ label: '閉じる', cls: 'secondary' });
        this.openSheet({ title: `${cardIcon('ic')} ${info.name}`, body, buttons, bind });
    }

    openTileSheet(tile) {
        const view = this.view;
        const me = this.me();
        const usable = tile === 'yellow' && this.myTurn() && FREE_STAGES.includes(view.step.stage) && !view.step.yellowUsed && me.lira >= 2;
        let body = `<p>${TILE_TEXTS[tile]}</p>`;
        let bind;
        if (usable && me.assistants.length) {
            body += `<p class="muted">2リラで呼び戻す助手</p>${this.choiceRow('from', [...new Set(me.assistants)].map(x => ({ value: x, label: PLACES[x].short })))}`;
            bind = (el) => el.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => this.send({ type: 'yellow', from: Number(b.dataset.value) })));
        }
        this.openSheet({ title: `${goodIcon(tile, 'ic')} ${TILE_NAMES[tile]}`, body, buttons: [{ label: '閉じる', cls: 'secondary' }], bind });
    }

    openLog() {
        const logs = this.view?.logs ?? [];
        $('#log-list').innerHTML = logs.slice(-80).reverse().map(line => `<li>${escapeHtml(line)}</li>`).join('');
        $('#log').showModal();
    }

    // ---- 結果 ----

    showResult() {
        const view = this.view;
        if (!view?.results) return;
        const winners = view.winners;
        $('#result-title').textContent = winners.includes(view.you)
            ? (winners.length > 1 ? '引き分け（勝ちを分け合う）' : 'あなたの勝ち！')
            : `${view.players[winners[0]].name}の勝ち`;
        $('#result-list').innerHTML = view.results.map((r, i) => {
            const p = view.players[r.seat];
            return `<li class="${winners.includes(r.seat) ? 'win' : ''}" style="--c:${this.colorOf(r.seat)}">
                <span class="r-rank">${i + 1}</span><span class="r-name">${escapeHtml(p.name)}</span>
                <span class="r-stat">${rubyIcon('mini')}${r.rubies}</span><span class="r-stat">${coinIcon('mini')}${r.lira}</span>
                <span class="r-sub">品物${r.goods}・カード${r.cards}</span></li>`;
        }).join('');
        if (!$('#result').open) $('#result').showModal();
    }

    toast(message, ms = 1800) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), ms);
    }
}
