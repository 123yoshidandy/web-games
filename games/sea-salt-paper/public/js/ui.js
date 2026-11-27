/**
 * 画面（タイトル・ゲーム・ラウンドの結果・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 */

import { CARDS, TYPES, duoEffect } from './game.js';
import { TYPE_ORDER, COLORS, COLOR_NAMES } from './cards.js';
import LocalGameController, { loadSavedGame, clearSavedGame, CPU_STEP_DELAY_MS } from './game-controller.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl, GAME } from './online-config.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import { CPU_LEVELS } from './cpu-player.js';
import { symbolsSvg, cardHtml, cardBackHtml, icon, CARD_TEXT, cardName } from './art.js';
import { music } from './music.js';

const SETTINGS_KEY = 'sea-salt-paper.settings';
const CPU_NAMES = ['ナギ', 'ミナト', 'シオン'];
const RESULT_DELAY_MS = 1100;
const FLY_MS = 420;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [2, 3, 4].includes(saved.count) ? saved.count : 2,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy'
        };
    } catch {
        return { count: 2, level: 'easy' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// 手札の並び：種類の順、同じ種類は色の順
const sortHand = (ids) => [...ids].sort((a, b) => (TYPE_ORDER.indexOf(CARDS[a].type) - TYPE_ORDER.indexOf(CARDS[b].type))
    || (COLORS.indexOf(CARDS[a].color) - COLORS.indexOf(CARDS[b].color)) || (a - b));

const EFFECT_NAMES = { crab: 'カニ', boat: 'ボート', fish: '魚', steal: 'サメと泳ぐ人' };

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.selected = [];        // 手札で選んだカード（2枚まで）
        this.keepCard = null;      // 引いた2枚から残すカード
        this.stealCards = null;    // 相手を選んでいる、サメと泳ぐ人の2枚
        this.lastSeq = 0;
        this.shownRound = 0;       // 結果を見せたラウンド
        this.resultTimer = null;
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'シーソルト＆ペーパー',
            game: 'sea-salt-paper',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: CPU_STEP_DELAY_MS,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [],
            onStart: (controller) => this.beginGame(controller),
            onUpdate: () => this.render(),
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
        this.renderHelpCards();
        window.addEventListener('resize', () => { if (this.view) this.renderHand(); });
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
        this.clearChoices();
        this.view = null;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        const view = this.controller.getView();
        this.lastSeq = view.events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は動かさない
        // ラウンドの番号は、結果を出すまで変わらない。続きから始めたとき、結果を見ている途中なら見せ直す
        this.shownRound = view.round - 1;
        this.render();
        if (!this.controller.isOnline) this.controller.scheduleCpu();
    }

    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    goHome() {
        if (this.controller?.isOnline) return this.online.confirmLeave();
        this.showTitle();
    }

    newGame() {
        const { count, level } = this.settings;
        const players = [{ name: 'あなた', isCPU: false },
            ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true, cpuLevel: level }))];
        this.startGame({ players, options: {} });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        ['#result', '#round-result', '#crab', '#player-detail', '#card-detail'].forEach(id => { if ($(id).open) $(id).close(); });
    }

    clearChoices() {
        this.selected = [];
        this.keepCard = null;
        this.stealCards = null;
    }

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
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#online-button').addEventListener('click', () => this.online.open());
        $('#again').addEventListener('click', () => {
            if (!this.controller?.isOnline) return this.newGame();
            $('#result').close();
            this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
        });
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        $('#home').addEventListener('click', () => this.goHome());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#hint').addEventListener('click', () => this.showHint());
        $('#next-round').addEventListener('click', () => {
            $('#round-result').close();
            if (this.view?.phase === 'roundEnd') this.send({ type: 'nextRound' });
        });

        // ダイアログは外側のタップと「閉じる」で閉じる（結果とカニは、外側では閉じない）
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            if (['result', 'round-result', 'crab'].includes(dialog.id)) {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        $('#table').addEventListener('click', (event) => {
            if (event.target.closest('[data-deck]')) return this.tapDeck();
            const pile = event.target.closest('[data-pile]');
            if (pile) this.tapPile(Number(pile.dataset.pile));
        });
        $('#hand').addEventListener('click', (event) => {
            const drawn = event.target.closest('[data-drawn]');
            if (drawn) return this.tapDrawn(Number(drawn.dataset.drawn));
            const card = event.target.closest('.card[data-card]');
            if (card) this.tapHand(Number(card.dataset.card));
        });
        $('#me').addEventListener('click', (event) => {
            const card = event.target.closest('.card[data-card]');
            if (card) this.showCardDetail(Number(card.dataset.card));
        });
        $('#opponents').addEventListener('click', (event) => {
            const chip = event.target.closest('[data-player]');
            if (!chip) return;
            const seat = Number(chip.dataset.player);
            if (this.stealCards && this.view.stealTargets.includes(seat)) {
                const cards = this.stealCards;
                this.stealCards = null;
                return this.send({ type: 'duo', cards, target: seat });
            }
            this.showPlayerDetail(seat);
        });
        $('#player-detail-body').addEventListener('click', (event) => {
            const card = event.target.closest('.card[data-card]');
            if (card) this.showCardDetail(Number(card.dataset.card));
        });
        $('#crab-cards').addEventListener('click', (event) => {
            const card = event.target.closest('.card[data-card]');
            if (!card || !this.myTurn('crab')) return;
            $('#crab').close();
            this.send({ type: 'crabTake', card: Number(card.dataset.card) });
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            this.act(button.dataset.act);
        });

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(button => {
            button.setAttribute('aria-checked', String(Number(button.dataset.count) === this.settings.count));
        });
        document.querySelectorAll('#cpu-level button').forEach(button => {
            button.setAttribute('aria-checked', String(button.dataset.level === this.settings.level));
        });
    }

    renderTitleArt() {
        const find = (type, color) => CARDS.find(c => c.type === type && c.color === color).id;
        const ids = [find('boat', 'yellow'), find('mermaid', 'white'), find('fish', 'darkBlue')];
        $('#title-art').innerHTML = `<div class="fan">${ids.map((id, i) => cardHtml(id, { cls: `fan-${i}` })).join('')}</div>`;
    }

    renderHelpCards() {
        const item = (type) => {
            const id = CARDS.find(c => c.type === type).id;
            return `<li>${cardHtml(id, { cls: 'mini' })}<span><strong>${TYPES[type].name}</strong>（${TYPES[type].count}枚）：${CARD_TEXT[type]}</span></li>`;
        };
        const groups = { duo: '#help-duo', collect: '#help-collect', multi: '#help-multi', mermaid: '#help-mermaid' };
        Object.entries(groups).forEach(([group, selector]) => {
            $(selector).innerHTML = TYPE_ORDER.filter(t => TYPES[t].group === group).map(item).join('');
        });
    }

    // ---- 操作 ----

    myTurn(phase = null) {
        const view = this.view;
        return !!view && view.current === view.you && view.phase !== 'roundEnd' && view.phase !== 'end' && (phase === null || view.phase === phase);
    }

    get me() {
        return this.view.players[this.view.you];
    }

    // ---- ヒント ----

    // おすすめの手を、カードを選んだ状態にして印を付ける（画面だけ。記録には入れず、自分が動いたら消す）
    showHint() {
        const command = this.controller?.hint();
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.clearChoices();
        this.hintCommand = command;
        if (command.type === 'keep') this.keepCard = command.card;
        if (command.type === 'duo') this.selected = [...command.cards];
        this.render();
        const target = command.target !== undefined ? `（${this.view.players[command.target].name}から）` : '';
        const text = {
            drawDeck: '山札から2枚引く',
            takeDiscard: '白い枠の捨て札を取る',
            keep: '選んだカードを残し、もう1枚を白い枠の捨て札へ',
            crabLook: '白い枠の捨て札を見る',
            crabTake: '白い枠のカードを取る',
            duo: `選んだ2枚組を出す${target}`,
            endTurn: 'ターンを終える',
            stop: 'ストップを宣言する',
            lastChance: 'ラストチャンスを宣言する'
        }[command.type] ?? '';
        this.toast(`おすすめ：${text}`);
    }

    markHint() {
        const c = this.hintCommand;
        if (!c) return;
        const list = {
            drawDeck: ['#table [data-deck]'],
            takeDiscard: [`#table [data-pile="${c.pile}"]`],
            keep: [`[data-drawn="${c.card}"]`, `#table [data-pile="${c.pile}"]`],
            crabLook: [`#table [data-pile="${c.pile}"]`],
            crabTake: [`#crab-cards .card[data-card="${c.card}"]`],
            duo: ['#actions [data-act="duo"]', ...(c.target !== undefined ? [`#opponents [data-player="${c.target}"]`] : [])],
            endTurn: ['#actions [data-act="endTurn"]'],
            stop: ['#actions [data-act="stop"]'],
            lastChance: ['#actions [data-act="lastChance"]']
        }[c.type] ?? [];
        list.forEach(s => document.querySelectorAll(s).forEach(el => el.classList.add('recommended')));
    }

    send(command) {
        this.clearChoices();
        this.hintCommand = null;
        this.controller?.send(command);
    }

    tapDeck() {
        if (this.myTurn('draw') && this.view.deckCount > 0) this.send({ type: 'drawDeck' });
    }

    tapPile(pile) {
        const view = this.view;
        const info = view.discards[pile];
        if (this.myTurn('draw')) {
            if (info.count > 0) this.send({ type: 'takeDiscard', pile });
            return;
        }
        if (this.myTurn('keep') && this.keepCard !== null) {
            if (allowedPiles(view).includes(pile)) this.send({ type: 'keep', card: this.keepCard, pile });
            return;
        }
        if (this.myTurn('crab') && view.crab.pile === null) {
            if (info.count > 0) this.send({ type: 'crabLook', pile });
            return;
        }
        if (info.top !== null) this.showCardDetail(info.top);
    }

    tapDrawn(card) {
        if (!this.myTurn('keep')) return;
        const piles = allowedPiles(this.view);
        // 置ける山が1つだけなら、すぐに置く
        if (piles.length === 1) return this.send({ type: 'keep', card, pile: piles[0] });
        this.keepCard = this.keepCard === card ? null : card;
        music.play(this.keepCard === null ? 'cancel' : 'select');
        this.render();
    }

    tapHand(card) {
        if (!this.myTurn('play')) return this.showCardDetail(card);
        this.stealCards = null;
        if (this.selected.includes(card)) this.selected = this.selected.filter(id => id !== card);
        else this.selected = [...this.selected, card].slice(-2);
        music.play('select');
        this.render();
    }

    act(action) {
        const view = this.view;
        if (action === 'cancel') {
            music.play('cancel');
            this.clearChoices();
            return this.render();
        }
        if (action === 'duo' && this.selected.length === 2) {
            const cards = [...this.selected];
            if (duoEffect(cards[0], cards[1]) === 'steal' && view.stealTargets.length > 1) {
                // 相手が何人もいれば、相手の札を押して選ぶ
                this.selected = [];
                this.stealCards = cards;
                music.play('select');
                return this.render();
            }
            const target = duoEffect(cards[0], cards[1]) === 'steal' ? view.stealTargets[0] : undefined;
            return this.send({ type: 'duo', cards, ...(target === undefined ? {} : { target }) });
        }
        if (['endTurn', 'stop', 'lastChance'].includes(action)) this.send({ type: action });
    }

    // ---- 描く ----

    render() {
        if (!this.controller) return;
        const before = this.captureAnchors();
        const view = this.controller.getView();
        const previous = this.view;
        const prevCurrent = previous?.current;
        this.view = view;
        this.recordLocalResult(previous);
        $('#hint').hidden = Boolean(this.controller.isOnline); // ヒントはローカル対戦だけ
        this.validateChoices();

        this.renderOpponents();
        this.renderTable();
        this.renderMe();
        this.renderHand();
        this.renderActions();
        this.renderCrab();
        if (this.view.phase === 'end' || this.view.current !== this.view.you) this.hintCommand = null;
        this.markHint();

        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        this.playEvents(fresh, before);
        this.playSound(fresh, view, prevCurrent);
        this.afterRender();
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // 終局に切り替わった1回だけ送る。id はシードから作る（同じ対戦を2回数えない）
    recordLocalResult(previous) {
        const v = this.view;
        const controller = this.controller;
        if (!previous || controller.isOnline || controller.isReplay) return;
        if (v.phase !== 'end' || previous.phase === 'end') return;
        recordResult({ game: GAME, id: `${GAME}-${controller.game.options.seed}`, outcome: outcomeFromWinners(v.winners, v.you, v.players.length) });
    }

    // 新しい出来事から効果音を1つ鳴らす。自分の操作はその音、相手の番の終わりは notify、自分の番になったら turn、終わりは勝ち負け
    playSound(fresh, view, prevCurrent) {
        if (fresh.length === 0) return;
        if (fresh.some(e => e.type === 'end')) return music.play(view.winners.includes(view.you) ? 'win' : 'lose');
        if (fresh.some(e => e.type === 'roundStart')) return music.play('shuffle');
        const roundEnd = fresh.find(e => e.type === 'roundEnd');
        if (roundEnd) return music.play(roundEnd.gained[view.you] > 0 ? 'gain' : 'notify');
        const mine = fresh.filter(e => e.seat === view.you && e.type !== 'turn');
        if (mine.length > 0) {
            const types = mine.map(e => e.type);
            if (types.includes('steal')) return music.play('capture');
            if (types.some(t => ['drawDeck', 'takeDiscard', 'fish', 'crabTake'].includes(t))) return music.play('draw');
            if (types.some(t => ['discard', 'duo', 'call'].includes(t))) return music.play('place');
            if (types.includes('crabLook')) return music.play('select');
        }
        // 相手の手は1手ずつ鳴らさず、番が回ったときにまとめて知らせる
        const turn = fresh.findLast(e => e.type === 'turn');
        if (!turn || mine.length > 0) return;
        if (turn.seat === view.you) music.play('turn');
        else if (prevCurrent !== view.you) music.play('notify');
    }

    // 選んでいたものが、状態の変化でなくなったら外す
    validateChoices() {
        const view = this.view;
        if (!this.myTurn('play')) {
            this.selected = [];
            this.stealCards = null;
        }
        const hand = this.me.hand ?? [];
        this.selected = this.selected.filter(id => hand.includes(id));
        if (!this.myTurn('keep') || !view.drawn?.includes(this.keepCard)) this.keepCard = null;
    }

    afterRender() {
        const view = this.view;
        if (view.phase === 'roundEnd' && this.shownRound < view.round) {
            this.shownRound = view.round;
            clearTimeout(this.resultTimer);
            this.resultTimer = setTimeout(() => this.showRoundResult(), RESULT_DELAY_MS);
        }
        if (view.phase === 'end' && !$('#result').open) {
            clearTimeout(this.resultTimer);
            this.resultTimer = setTimeout(() => this.showResult(), RESULT_DELAY_MS);
        }
    }

    renderOpponents() {
        const view = this.view;
        const n = view.players.length;
        const order = Array.from({ length: n - 1 }, (_, i) => (view.you + 1 + i) % n);
        const lc = view.lastChance;
        $('#opponents').innerHTML = order.map(seat => {
            const p = view.players[seat];
            const active = view.current === seat && !['roundEnd', 'end'].includes(view.phase);
            const target = this.stealCards && view.stealTargets.includes(seat);
            const badge = lc?.caller === seat ? '<span class="badge">ラストチャンス</span>' : '';
            return `<button class="opp ${active ? 'active' : ''} ${target ? 'target' : ''} ${p.revealed ? 'revealed' : ''}" data-player="${seat}" aria-label="${escapeHtml(p.name)}の札">
                <span class="opp-name">${escapeHtml(p.name)}</span><span class="opp-score">${p.score}</span>
                <span class="opp-sub"><span>${icon('cards')}${p.handCount}</span><span>${icon('pair')}${p.duos.length}</span></span>${badge}
            </button>`;
        }).join('');
    }

    renderTable() {
        const view = this.view;
        const drawTurn = this.myTurn('draw');
        const keepTurn = this.myTurn('keep') && this.keepCard !== null;
        const crabTurn = this.myTurn('crab') && view.crab.pile === null;
        const allowed = keepTurn ? allowedPiles(view) : [];
        const deck = `<div class="slot" data-deck>${view.deckCount > 0 ? cardBackHtml({ cls: drawTurn ? 'glow' : '', count: view.deckCount }) : '<div class="card empty"></div>'}</div>`;
        const piles = view.discards.map((pile, i) => {
            const glow = (drawTurn && pile.count > 0) || allowed.includes(i) || (crabTurn && pile.count > 0);
            const face = pile.top !== null ? cardHtml(pile.top, { cls: glow ? 'glow' : '' }) : `<div class="card empty ${glow ? 'glow' : ''}"></div>`;
            const under = pile.count > 1 ? '<div class="card under"></div>' : '';
            return `<div class="slot pile" data-pile="${i}">${under}${face}<span class="pile-count">${pile.count}</span></div>`;
        }).join('');
        const lc = view.lastChance ? '<span class="lc">ラストチャンス</span>' : '';
        $('#table').innerHTML = `${deck}${piles}<div class="round-info"><span class="round">ラウンド ${view.round}</span><span class="goal">${view.target}点で勝ち</span>${lc}</div>`;
    }

    renderMe() {
        const view = this.view;
        const me = this.me;
        const duos = me.duos.map(pair => `<span class="duo">${pair.map(id => cardHtml(id, { cls: 'tiny' })).join('')}</span>`).join('');
        const ready = me.points >= view.threshold;
        $('#me').innerHTML = `<div class="duos">${duos}</div>
            <div class="my-points ${ready ? 'ready' : ''}" title="このラウンドの点"><b>${me.points}</b><span>点</span></div>
            <div class="my-sub"><span title="色のボーナス">色 ${me.bonus ?? 0}</span><span title="合計">計 ${me.score}</span></div>`;
        $('#me').classList.toggle('active', this.myTurn() || false);
    }

    renderHand() {
        const view = this.view;
        if (!view) return;
        const el = $('#hand');
        const hand = sortHand(this.me.hand ?? []);
        const pairable = this.selected.length === 1 ? hand.filter(id => id !== this.selected[0] && duoEffect(id, this.selected[0])) : [];
        const fresh = new Set(this.freshCards ?? []);
        const cards = hand.map(id => cardHtml(id, {
            cls: `${this.selected.includes(id) ? 'selected' : ''} ${pairable.includes(id) ? 'pairable' : ''} ${fresh.has(id) ? 'fresh' : ''}`
        })).join('');
        let overlay = '';
        if (this.myTurn('keep') && view.drawn) {
            const note = this.keepCard === null ? '残す1枚' : '捨てる山を選ぶ';
            overlay = `<div class="drawn-panel"><div class="drawn-cards">${view.drawn.map(id => `<button class="drawn-btn" data-drawn="${id}" aria-label="残す">${cardHtml(id, { cls: id === this.keepCard ? 'selected' : '' })}</button>`).join('')}</div><span class="drawn-note">${note}</span></div>`;
        }
        el.innerHTML = `<div class="hand-cards">${cards}</div>${overlay}`;
        layoutHand(el.querySelector('.hand-cards'));
    }

    renderActions() {
        const view = this.view;
        let html;
        const cancel = '<button class="btn small ghost" data-act="cancel" aria-label="やめる">×</button>';
        if (this.myTurn('play')) {
            if (this.stealCards) {
                html = `<span class="act-text">取る相手を選ぶ</span>${cancel}`;
            } else {
                const duo = this.selected.length === 2 ? duoEffect(this.selected[0], this.selected[1]) : null;
                if (duo) {
                    // 2枚組を選んでいる間は、出すかやめるかだけ
                    html = `<span class="act-text">${EFFECT_NAMES[duo]}の2枚組</span><button class="btn small accent" data-act="duo">出す</button>${cancel}`;
                } else {
                    const ends = view.canEnd ? `<button class="btn small call" data-act="stop">ストップ</button><button class="btn small call" data-act="lastChance">ラストチャンス</button>` : '';
                    html = `${ends}<button class="btn small primary" data-act="endTurn">ターン終了</button>`;
                }
            }
        } else {
            const last = view.logs.at(-1) ?? '';
            html = `<span class="act-log">${escapeHtml(last)}</span>`;
        }
        $('#actions').innerHTML = html;
    }

    renderCrab() {
        const view = this.view;
        const open = this.myTurn('crab') && view.crab.pile !== null;
        if (open) {
            $('#crab-cards').innerHTML = [...view.crab.cards].reverse().map(id => cardHtml(id)).join('');
            if (!$('#crab').open) $('#crab').showModal();
        } else if ($('#crab').open) {
            $('#crab').close();
        }
    }

    showCardDetail(id) {
        const type = CARDS[id].type;
        $('#card-detail-body').innerHTML = `${cardHtml(id, { cls: 'large' })}<div class="detail-text"><h2>${cardName(id)}</h2>
            <p class="detail-color">${COLOR_NAMES[CARDS[id].color]}</p><p>${CARD_TEXT[type]}</p></div>`;
        $('#card-detail').showModal();
    }

    showPlayerDetail(seat) {
        const p = this.view.players[seat];
        $('#player-detail-name').textContent = p.name;
        const duos = p.duos.length ? p.duos.map(pair => `<span class="duo">${pair.map(id => cardHtml(id, { cls: 'small' })).join('')}</span>`).join('') : '<span class="none">なし</span>';
        const hand = p.hand ? `<h3>手札（公開）</h3><div class="card-row">${sortHand(p.hand).map(id => cardHtml(id, { cls: 'small' })).join('')}</div>` : `<p class="note">手札 ${p.handCount}枚</p>`;
        $('#player-detail-body').innerHTML = `<p class="note">合計 ${p.score}点・${p.hand ? 'このラウンド' : '出した組'} ${p.points}点</p><h3>出した2枚組</h3><div class="card-row">${duos}</div>${hand}`;
        $('#player-detail').showModal();
    }

    showRoundResult() {
        const view = this.view;
        if (!view || view.phase !== 'roundEnd' || !view.roundResult) return;
        const r = view.roundResult;
        const name = (seat) => escapeHtml(view.players[seat].name);
        $('#round-title').textContent = `ラウンド ${r.round}`;
        $('#round-note').textContent = r.reason === 'stop' ? `${view.players[r.caller].name}のストップ`
            : r.reason === 'lastChance' ? `${view.players[r.caller].name}のラストチャンス：${r.success ? '成功' : '失敗'}`
                : '山札がなくなったので、点なし';
        $('#round-list').innerHTML = view.players.map((p, i) => {
            const cards = [...sortHand(r.hands[i]), ...p.duos.flat()];
            const detail = r.reason === 'deckEmpty' ? '' : `カード ${r.points[i]}点・色 ${r.bonus[i]}`;
            return `<li class="${i === r.caller && r.reason !== 'deckEmpty' ? 'caller' : ''}">
                <span class="r-name">${name(i)}</span><span class="r-pts"><b>+${r.gained[i]}</b>　計 ${r.totals[i]}</span>
                <span class="r-sub">${detail}</span>
                <span class="r-cards">${cards.map(id => cardHtml(id, { cls: 'tiny' })).join('')}</span></li>`;
        }).join('');
        $('#round-result').showModal();
    }

    showResult() {
        const view = this.view;
        if (!view || view.phase !== 'end') return;
        if ($('#round-result').open) $('#round-result').close();
        const winner = view.winners[0];
        const n = view.players.length;
        const order = (p) => (p.id - view.roundStarter + n) % n;
        const ranked = [...view.players].sort((a, b) => (b.id === winner) - (a.id === winner) || (b.score - a.score) || (order(b) - order(a)));
        $('#result-title').textContent = winner === view.you ? 'あなたの勝ち' : `${view.players[winner].name}の勝ち`;
        $('#result-note').textContent = view.endReason === 'mermaids' ? '人魚を4枚そろえました' : '';
        $('#result-list').innerHTML = ranked.map(p => `<li class="${p.id === winner ? 'winner' : ''}">
            <span class="r-name">${escapeHtml(p.name)}</span><span class="r-pts"><b>${p.score}</b>点</span>
            <span class="r-sub">${view.history.map(row => row[p.id]).join('・')}</span></li>`).join('');
        $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
    }

    // ---- 演出：カードが元の場所から行き先へ飛ぶ ----

    captureAnchors() {
        const rect = (el) => el?.getBoundingClientRect();
        return {
            deck: rect(document.querySelector('#table [data-deck]')),
            piles: [0, 1].map(i => rect(document.querySelector(`#table [data-pile="${i}"]`))),
            players: Object.fromEntries([...document.querySelectorAll('#opponents [data-player]')].map(el => [el.dataset.player, rect(el)])),
            hand: rect($('#hand'))
        };
    }

    playEvents(events, before) {
        const view = this.view;
        this.freshCards = [];
        if (events.length === 0 || !before.deck) return;
        const now = this.captureAnchors();
        const seatRect = (seat) => (seat === view.you ? now.hand : now.players[seat]);
        events.forEach((e, i) => {
            const delay = i * 90;
            const face = (id) => (id === undefined ? cardBackHtml() : cardHtml(id));
            switch (e.type) {
                case 'discard': return this.fly(before.deck, now.piles[e.pile], face(e.card), delay);
                case 'takeDiscard': return this.fly(before.piles[e.pile], seatRect(e.seat), face(e.card), delay);
                case 'drawDeck': if (e.seat !== view.you) return this.fly(before.deck, seatRect(e.seat), cardBackHtml(), delay); return;
                case 'fish': return this.fly(before.deck, seatRect(e.seat), e.seat === view.you ? face(e.card) : cardBackHtml(), delay);
                case 'crabTake': return this.fly(before.piles[e.pile], seatRect(e.seat), e.seat === view.you ? face(e.card) : cardBackHtml(), delay);
                case 'steal': return this.fly(e.target === view.you ? before.hand : before.players[e.target], seatRect(e.seat), face(e.card), delay);
                default: return undefined;
            }
        });
        // 自分の手札に入ったカードは、手札の中で少し弾ませる
        this.freshCards = events.filter(e => ['takeDiscard', 'fish', 'crabTake', 'steal'].includes(e.type) && e.seat === view.you && e.card !== undefined).map(e => e.card);
        if (this.freshCards.length) this.renderHand();
    }

    fly(from, to, html, delay = 0) {
        if (!from || !to || reduceMotion()) return;
        const el = document.createElement('div');
        el.className = 'flyer';
        el.innerHTML = html;
        const w = 54;
        const h = w * 1.4;
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
        document.body.appendChild(el);
        const cx = (r) => r.left + r.width / 2 - w / 2;
        const cy = (r) => r.top + r.height / 2 - h / 2;
        const animation = el.animate([
            { transform: `translate(${cx(from)}px, ${cy(from)}px) scale(1)`, opacity: 1 },
            { transform: `translate(${(cx(from) + cx(to)) / 2}px, ${Math.min(cy(from), cy(to)) - 30}px) scale(1.05)`, opacity: 1, offset: 0.5 },
            { transform: `translate(${cx(to)}px, ${cy(to)}px) scale(.8)`, opacity: 0.2 }
        ], { duration: FLY_MS, delay, easing: 'ease-in-out', fill: 'both' });
        animation.onfinish = () => el.remove();
        setTimeout(() => el.remove(), FLY_MS + delay + 400);
    }
}

// 引いた残りを置ける山（空の山があれば、そこだけ）
function allowedPiles(view) {
    const empty = [0, 1].filter(i => view.discards[i].count === 0);
    return empty.length === 1 ? empty : [0, 1];
}

// 手札を1〜2段に並べ、入りきらなければ重ねる
function layoutHand(container) {
    if (!container) return;
    const cards = [...container.children];
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (cards.length === 0 || width === 0) return;
    const gap = 6;
    // 1段で重ならずに並ぶなら1段、重なるなら2段にする
    const oneH = Math.min(height - 14, 118);
    const fitsOne = cards.length * (oneH / 1.4) + (cards.length - 1) * gap <= width;
    const rows = fitsOne || cards.length === 1 ? 1 : 2;
    const cardH = rows === 1 ? oneH : Math.min((height - gap - 14) / 2, 118);
    const cardW = cardH / 1.4;
    const perRow = Math.ceil(cards.length / rows);
    cards.forEach((card, i) => {
        const row = Math.floor(i / perRow);
        const inRow = Math.min(perRow, cards.length - row * perRow);
        const natural = inRow * cardW + (inRow - 1) * gap;
        const step = natural <= width ? cardW + gap : (width - cardW) / Math.max(1, inRow - 1);
        const used = natural <= width ? natural : width;
        const left = (width - used) / 2 + (i - row * perRow) * step;
        card.style.width = `${cardW}px`;
        card.style.height = `${cardH}px`;
        card.style.left = `${left}px`;
        card.style.top = `${10 + row * (cardH + gap)}px`;
        card.style.zIndex = String(i + 1);
    });
}
