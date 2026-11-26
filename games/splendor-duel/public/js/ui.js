/**
 * 画面（タイトル・ゲーム・結果・能力の選択・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 */

import {
    CARDS, ROYALS, COLORS, GOLD, TOKEN_COLORS, LEVELS, RESERVE_LIMIT, COLOR_NAMES, ABILITY_NAMES,
    WIN_POINTS, WIN_CROWNS, WIN_COLOR_POINTS, CELLS, asLine, isGemOrPearl, countTokens
} from './game.js';
import LocalGameController, { loadSavedGame, clearSavedGame, CPU_STEP_DELAY_MS } from './game-controller.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';

import { symbolsSvg, tokenChip, cardHtml, cardBackHtml, royalHtml, gemIcon, lineIcon, scrollIcon } from './art.js';
import { captureAnchors, playEvents } from './animator.js';
import { music } from './music.js';

const SETTINGS_KEY = 'splendor-duel.settings';
const CPU_NAME = 'ルカ';
const AUTO_DELAY_MS = 700;
const RESULT_DELAY_MS = 900;
const REASON_TEXT = {
    points: `${WIN_POINTS}点に達しました`,
    crowns: `王冠が${WIN_CROWNS}個になりました`,
    color: `同じ色のカードで${WIN_COLOR_POINTS}点に達しました`,
    stalled: '2人とも何もできなくなりました'
};
const ABILITY_TEXT = {
    turn: 'この手番のあと、もう1手番行う',
    token: 'カードと同じ色のトークンを、盤から1個取る',
    privilege: '特権の巻物を1枚得る',
    steal: '相手の宝石かパールを1個取る',
    wild: '持っているボーナスの色を1つ写す'
};

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return { level: ['easy', 'normal'].includes(saved.level) ? saved.level : 'normal' };
    } catch {
        return { level: 'normal' };
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
        // 選んでいるもの：{ kind: 'cells', cells } / { kind: 'card', card, reserved } / { kind: 'deck', level }
        //               / { kind: 'gold', reserve: { card } か { level } }（予約で取る黄金を選ぶ） / { kind: 'replenish' }（補充の確認）
        this.selection = null;
        this.discardPick = {};
        this.lastSeq = 0;           // 演出を済ませたイベントの番号
        this.choiceShownFor = null; // 選択のシートを出した場面（閉じたら、同じ場面では自分から出し直さない）
        this.autoTimer = null;
        this.resultTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: '宝石の煌き デュエル',
            game: 'splendor-duel',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: CPU_STEP_DELAY_MS,
            minPlayers: 2,
            maxPlayers: 2,
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
        this.renderLevelSelect();
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
        // ヒント（と待った）はローカル対戦だけ
        document.querySelectorAll('#hint, #undo').forEach(el => { el.hidden = Boolean(controller.isOnline); });
        this.selection = null;
        this.discardPick = {};
        this.choiceShownFor = null;
        this.view = null;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        const view = this.controller.getView();
        this.lastSeq = view.events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は動かさない
        this.render();
        if (!this.controller.isOnline) this.controller.scheduleCpu();
    }

    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    goHome() {
        if (this.controller?.isOnline) return this.online.confirmLeave();
        this.showTitle();
    }

    newGame() {
        const players = [{ name: 'あなた', isCPU: false }, { name: CPU_NAME, isCPU: true, cpuLevel: this.settings.level }];
        this.startGame({ players, options: {} });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.autoTimer);
        clearTimeout(this.resultTimer);
        ['#result', '#choice', '#player-detail'].forEach(id => { if ($(id).open) $(id).close(); });
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#cpu-level').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-level]');
            if (!button) return;
            this.settings.level = button.dataset.level;
            saveSettings(this.settings);
            this.renderLevelSelect();
        });
        $('#start').addEventListener('click', () => this.newGame());
        $('#online-button').addEventListener('click', () => this.online.open());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => {
            if (!this.controller?.isOnline) return this.newGame();
            document.querySelectorAll('dialog[open]').forEach(d => d.close());
            this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
        });
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        $('#home').addEventListener('click', () => this.goHome());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#hint').addEventListener('click', () => this.showHint());

        // ダイアログは外側のタップと「閉じる」で閉じる（結果は外側では閉じない）
        // 能力の選択は、閉じても選択は残る（盤を見てから、操作の欄の「選ぶ」で出し直す）
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
        $('#choice').addEventListener('close', () => this.render());

        $('#board').addEventListener('click', (event) => {
            const cell = event.target.closest('[data-cell]');
            if (cell) this.pickCell(Number(cell.dataset.cell));
        });
        $('#pyramid').addEventListener('click', (event) => {
            if (event.target.closest('[data-act="replenish"]')) return this.pickReplenish();
            const deck = event.target.closest('[data-deck]');
            if (deck) return this.pickDeck(Number(deck.dataset.deck));
            const card = event.target.closest('.card[data-card]');
            if (card) this.pickCard(Number(card.dataset.card), false);
        });
        $('#me').addEventListener('click', (event) => {
            const card = event.target.closest('.card[data-card]');
            if (card) return this.pickCard(Number(card.dataset.card), true);
            const gem = event.target.closest('[data-me-color]');
            if (gem && this.myTurn('discard')) return this.pickDiscard(gem.dataset.meColor);
            if (event.target.closest('.me-head')) this.showPlayerDetail(this.view.you);
        });
        $('#opponent').addEventListener('click', () => this.showPlayerDetail(1 - this.view.you));
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            this.act(button.dataset.act, button.dataset);
        });
        $('#choice-options').addEventListener('click', (event) => {
            const option = event.target.closest('[data-option]');
            if (!option || !this.myTurn('choose')) return;
            const type = this.view.choice.type;
            const value = type === 'royal' ? Number(option.dataset.option) : option.dataset.option;
            const key = { wild: 'color', steal: 'color', royal: 'royal' }[type];
            $('#choice').close();
            this.controller?.send({ type, [key]: value });
        });

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    renderLevelSelect() {
        document.querySelectorAll('#cpu-level button').forEach(button => {
            button.setAttribute('aria-checked', String(button.dataset.level === this.settings.level));
        });
    }

    renderTitleArt() {
        const pick = (pred) => CARDS.find(pred).id;
        const cards = [
            pick(c => c.level === 3 && c.color === 'red' && c.crowns === 2),
            pick(c => c.level === 3 && c.color === 'wild' && c.ability === 'turn'),
            pick(c => c.level === 2 && c.color === 'blue' && c.ability === 'privilege')
        ];
        $('#title-art').innerHTML = `<div class="fan">${cards.map((id, i) => cardHtml(id, { cls: `fan-${i}` })).join('')}</div>
            <div class="title-chips">${['white', 'blue', 'pearl', 'gold', 'green', 'red', 'black'].map(c => tokenChip(c)).join('')}</div>`;
    }

    renderHelpPictures() {
        $('#help-privilege').innerHTML = scrollIcon() + tokenChip('red');
        $('#help-replenish').innerHTML = `<span class="bag-icon">${lineIcon('bag')}</span>`;
        // 取れる並びの例：斜めに3個
        $('#help-take').innerHTML = Array.from({ length: 9 }, (_, i) => {
            const on = [0, 4, 8].includes(i);
            return `<span class="mini-cell ${on ? 'on' : ''}">${on ? tokenChip(['blue', 'pearl', 'green'][i / 4]) : ''}</span>`;
        }).join('');
        $('#help-reserve').innerHTML = cardBackHtml(2, { cls: 'tiny' }) + tokenChip('gold');
        $('#help-buy').innerHTML = cardHtml(CARDS.find(c => c.level === 1 && c.color === 'black' && c.points === 1).id, { cls: 'tiny' });
        $('#help-abilities').innerHTML = ['turn', 'token', 'privilege', 'steal', 'wild'].map(a => `<li>
            <span class="ability-badge">${lineIcon(a === 'wild' ? 'wild' : a)}</span>
            <span><strong>${a === 'wild' ? '色なし' : ABILITY_NAMES[a]}</strong>：${ABILITY_TEXT[a]}</span></li>`).join('');
    }

    // ---- 選ぶ操作 ----

    myTurn(phase = 'main') {
        const view = this.view;
        return !!view && view.phase === phase && view.current === view.you;
    }

    get me() {
        return this.view.players[this.view.you];
    }

    // 選んだマスに足せるマス（すき間なく1本に並び、3個まで）
    candidateCells(cells) {
        if (cells.length >= 3) return [];
        const board = this.view.board;
        const result = [];
        for (let cell = 0; cell < CELLS; cell++) {
            if (cells.includes(cell) || !isGemOrPearl(board[cell])) continue;
            if (cells.length === 0 || asLine([...cells, cell])) result.push(cell);
        }
        return result;
    }

    pickCell(cell) {
        const view = this.view;
        if (!view) return;
        if (this.myTurn('choose') && view.choice.type === 'token') {
            if (view.choice.options.includes(cell)) this.controller?.send({ type: 'token', cell });
            return;
        }
        if (!this.myTurn()) return;
        const sel = this.selection;
        if (sel?.kind === 'gold') {
            if (view.board[cell] === GOLD) this.sendCommand({ type: 'reserve', ...sel.reserve, gold: cell });
            return;
        }
        if (!isGemOrPearl(view.board[cell])) return;
        const cells = sel?.kind === 'cells' ? [...sel.cells] : [];
        let next;
        if (cells.includes(cell)) {
            // 選んだマスをもう一度押すと外す。真ん中を外して1本でなくなったら、押したマスだけを選び直す
            const rest = cells.filter(c => c !== cell);
            next = rest.length === 0 || asLine(rest) ? rest : [cell];
        } else if (this.candidateCells(cells).includes(cell)) {
            next = [...cells, cell];
        } else {
            next = [cell];
        }
        this.selection = next.length ? { kind: 'cells', cells: asLine(next) ?? next } : null;
        music.play(next.includes(cell) ? 'select' : 'cancel');
        this.render();
    }

    pickCard(card, reserved) {
        if (!this.myTurn()) return;
        const same = this.selection?.kind === 'card' && this.selection.card === card;
        this.selection = same ? null : { kind: 'card', card, reserved };
        music.play(same ? 'cancel' : 'select');
        this.render();
    }

    pickDeck(level) {
        if (!this.myTurn() || this.view.deckCounts[level] === 0) return;
        const same = this.selection?.kind === 'deck' && this.selection.level === level;
        this.selection = same ? null : { kind: 'deck', level };
        music.play(same ? 'cancel' : 'select');
        this.render();
    }

    pickReplenish() {
        if (!this.myTurn() || !this.canReplenish()) return;
        this.selection = this.selection?.kind === 'replenish' ? null : { kind: 'replenish' };
        music.play(this.selection ? 'select' : 'cancel');
        this.render();
    }

    pickDiscard(color) {
        const me = this.me;
        const picked = this.discardPick[color] ?? 0;
        const total = Object.values(this.discardPick).reduce((s, n) => s + n, 0);
        if (picked < me.tokens[color] && total < this.view.discardCount) this.discardPick[color] = picked + 1;
        else delete this.discardPick[color];
        music.play(this.discardPick[color] ? 'select' : 'cancel');
        this.render();
    }

    canReplenish() {
        return countTokens(this.view.bag) > 0 && this.view.board.includes(null);
    }

    // 予約：盤に黄金が2個以上あれば、どれを取るか選ぶ
    startReserve(reserve) {
        const golds = this.view.board.map((t, cell) => (t === GOLD ? cell : -1)).filter(cell => cell >= 0);
        if (golds.length === 1) return this.sendCommand({ type: 'reserve', ...reserve, gold: golds[0] });
        this.selection = { kind: 'gold', reserve };
        this.render();
    }

    sendCommand(command) {
        this.selection = null;
        this.hintCommand = null;
        this.controller?.send(command);
    }

    act(action, data) {
        const sel = this.selection;
        if (action === 'cancel') {
            music.play('cancel');
            this.selection = null;
            this.discardPick = {};
            this.render();
        } else if (action === 'take' && sel?.kind === 'cells') this.sendCommand({ type: 'take', cells: sel.cells });
        else if (action === 'privilege' && sel?.kind === 'cells' && sel.cells.length === 1) this.sendCommand({ type: 'privilege', cell: sel.cells[0] });
        else if (action === 'buy' && sel?.kind === 'card') this.sendCommand({ type: 'buy', card: sel.card });
        else if (action === 'reserve' && sel?.kind === 'card') this.startReserve({ card: sel.card });
        else if (action === 'reserve-deck' && sel?.kind === 'deck') this.startReserve({ level: sel.level });
        else if (action === 'replenish' && sel?.kind === 'replenish') this.sendCommand({ type: 'replenish' });
        else if (action === 'choose') this.showChoice(true);
        else if (action === 'unpick') {
            const color = data.color;
            if (this.discardPick[color] > 1) this.discardPick[color]--;
            else delete this.discardPick[color];
            this.render();
        } else if (action === 'discard') {
            const tokens = { ...this.discardPick };
            this.discardPick = {};
            this.hintCommand = null;
            this.controller?.send({ type: 'discard', tokens });
        }
    }

    // ---- 描く ----

    // 新しい出来事から効果音を1つ鳴らす。自分の手はその音、相手の番が終わったら notify、自分の番になったら turn、終わりは勝ち負け
    playSound(fresh, prevCurrent) {
        const view = this.view;
        if (fresh.length === 0 || prevCurrent === undefined) return;
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winners.includes(view.you) ? 'win' : 'lose');
        const mine = prevCurrent === view.you ? fresh.filter(e => e.seat === view.you && e.type !== 'turn').map(e => e.type) : [];
        if (mine.includes('steal')) return music.play('capture');
        if (['royal', 'take', 'privilege', 'ability-token', 'gain-privilege'].some(t => mine.includes(t))) return music.play('gain');
        if (mine.includes('buy') || mine.includes('wild')) return music.play('place');
        if (mine.includes('reserve')) return music.play('draw');
        if (mine.includes('replenish')) return music.play('shuffle');
        if (mine.includes('discard')) return music.play('pay');
        const turn = fresh.findLast(e => e.type === 'turn');
        if (!turn || mine.length > 0) return;
        if (turn.seat === view.you) music.play('turn');
        else if (prevCurrent !== view.you) music.play('notify');
    }

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const before = captureAnchors();
        const prevCurrent = this.view?.current;
        this.view = view;
        if (!this.myTurn()) this.selection = null;
        if (!this.myTurn('discard')) this.discardPick = {};
        this.validateSelection();

        this.renderOpponent();
        this.renderPyramid();
        this.renderBoard();
        this.renderMe();
        this.renderActions();
        if (this.view.phase === 'end' || this.view.current !== this.view.you) this.hintCommand = null;
        this.markHint();

        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        playEvents(fresh, before, { you: view.you });
        this.playSound(fresh, prevCurrent);

        this.afterRender();
    }

    // 選んでいたものが、場の変化でなくなったら選び直す
    validateSelection() {
        const sel = this.selection;
        if (!sel) return;
        const view = this.view;
        if (sel.kind === 'card') {
            const inPyramid = LEVELS.some(l => view.pyramid[l].includes(sel.card));
            const inHand = this.me.reserved.some(r => r.id === sel.card);
            if (!(sel.reserved ? inHand : inPyramid)) this.selection = null;
        }
        if (sel.kind === 'deck' && view.deckCounts[sel.level] === 0) this.selection = null;
        if (sel.kind === 'cells' && sel.cells.some(cell => !isGemOrPearl(view.board[cell]))) this.selection = null;
        if (sel.kind === 'gold' && !view.board.includes(GOLD)) this.selection = null;
        if (sel.kind === 'replenish' && !this.canReplenish()) this.selection = null;
    }

    afterRender() {
        const view = this.view;
        clearTimeout(this.autoTimer);
        // できることが1つだけなら、少し間を置いて自動で行う（必須の行動ができないときの補充と、パス）
        const forcedReplenish = this.myTurn() && !view.canPass && this.mustReplenish();
        if (forcedReplenish || view.canPass) {
            this.autoTimer = setTimeout(() => {
                if (!this.myTurn()) return;
                if (this.view.canPass) this.controller?.send({ type: 'pass' });
                else if (this.mustReplenish()) this.controller?.send({ type: 'replenish' });
            }, AUTO_DELAY_MS);
        }
        this.showChoice(false);
        if (view.phase === 'end' && !$('#result').open) {
            clearTimeout(this.resultTimer);
            this.resultTimer = setTimeout(() => this.showResult(), RESULT_DELAY_MS);
        }
    }

    // 必須の行動ができず、補充しかできないとき
    mustReplenish() {
        const view = this.view;
        if (!this.canReplenish()) return false;
        if (view.board.some(isGemOrPearl) || view.affordable.length > 0) return false;
        const canReserve = view.board.includes(GOLD) && this.me.reserved.length < RESERVE_LIMIT
            && (LEVELS.some(l => view.pyramid[l].some(id => id !== null)) || LEVELS.some(l => view.deckCounts[l] > 0));
        return !canReserve;
    }

    // 相手の欄（1行）
    renderOpponent() {
        const view = this.view;
        const seat = 1 - view.you;
        const p = view.players[seat];
        const active = view.current === seat && view.phase !== 'end';
        const el = $('#opponent');
        el.className = `opp ${active ? 'active' : ''}`;
        el.dataset.player = seat;
        el.innerHTML = `
            <span class="opp-name">${escapeHtml(p.name)}</span>
            ${this.statsHtml(p)}
            <span class="opp-extra"><span class="mini-back" title="予約">${p.reserved.length}</span></span>
            <span class="opp-gems">${this.gemCells(p)}</span>`;
    }

    // 点・王冠・特権（同じ色のカードの点が一番多い色も）
    statsHtml(p) {
        const best = COLORS.reduce((a, c) => (p.colorPoints[c] > p.colorPoints[a] ? c : a), COLORS[0]);
        const colorStat = p.colorPoints[best] > 0
            ? `<span class="stat stat-color" title="同じ色のカードの点">${gemIcon(best)}<b>${p.colorPoints[best]}</b></span>` : '';
        return `<span class="stats">
            <span class="stat stat-pts" title="点"><b>${p.points}</b>点</span>
            <span class="stat stat-crown" title="王冠">${lineIcon('crown')}<b>${p.crowns}</b></span>
            ${colorStat}
            <span class="stat stat-priv" title="特権">${lineIcon('privilege')}<b>${p.privileges}</b></span>
        </span>`;
    }

    gemCells(player, { me = false } = {}) {
        return TOKEN_COLORS.map(c => {
            const picked = me ? (this.discardPick[c] ?? 0) : 0;
            const n = player.tokens[c] - picked;
            const bonus = COLORS.includes(c) ? `<b class="bon ${player.bonuses[c] === 0 ? 'zero' : ''}">${player.bonuses[c]}</b>` : '<b class="bon none"></b>';
            return `<span class="gc gc-${c} ${picked ? 'picked' : ''}" ${me ? `data-me-color="${c}"` : ''}>
                ${bonus}${tokenChip(c, n, n === 0 ? 'empty' : '')}</span>`;
        }).join('');
    }

    renderPyramid() {
        const view = this.view;
        const mine = this.myTurn();
        const sel = this.selection;
        const royals = `<div class="royals">${view.royals.map(id => royalHtml(id)).join('')}</div>`;
        const pool = `<div class="pool" data-pool title="残りの特権">${Array.from({ length: view.privileges }, () => scrollIcon()).join('')}</div>`;
        const bagCount = countTokens(view.bag);
        const bag = `<div class="bag-box" data-bag>
            <span class="bag-icon" title="袋">${lineIcon('bag')}<b>${bagCount}</b></span>
            <button class="btn tiny-btn ${sel?.kind === 'replenish' ? 'on' : ''}" data-act="replenish" ${mine && this.canReplenish() ? '' : 'disabled'}>補充</button>
        </div>`;
        $('#pyramid').innerHTML = [3, 2, 1].map(level => {
            const deckSelected = sel?.kind === 'deck' && sel.level === level;
            const deck = view.deckCounts[level] > 0
                ? cardBackHtml(level, { cls: `deck ${deckSelected ? 'selected' : ''}`, attrs: `data-deck="${level}" role="button"`, count: view.deckCounts[level] })
                : `<div class="slot-empty deck-empty" data-deck-empty="${level}"></div>`;
            const slots = view.pyramid[level].map((id, slot) => {
                const key = `data-slot="${level}-${slot}"`;
                if (id === null) return `<div class="slot-empty" ${key}></div>`;
                const affordable = mine && view.affordable.includes(id);
                const selected = sel?.kind === 'card' && sel.card === id;
                return `<div class="slot" ${key}>${cardHtml(id, { cls: `${affordable ? 'affordable' : ''} ${selected ? 'selected' : ''}`, attrs: 'role="button"' })}</div>`;
            }).join('');
            const extra = level === 3 ? `<div class="row-extra">${royals}${pool}</div>` : level === 2 ? `<div class="row-extra">${bag}</div>` : '';
            return `<div class="pyramid-row lv${level}">${deck}${slots}${extra}</div>`;
        }).join('');
    }

    renderBoard() {
        const view = this.view;
        const sel = this.selection;
        const mine = this.myTurn();
        const selected = sel?.kind === 'cells' ? sel.cells : [];
        // 光らせるマス：続けて取れるマス・能力で選べるマス・予約で取る黄金
        let targets = [];
        if (mine && selected.length > 0) targets = this.candidateCells(selected);
        if (this.myTurn('choose') && view.choice.type === 'token') targets = view.choice.options;
        if (mine && sel?.kind === 'gold') targets = view.board.map((t, cell) => (t === GOLD ? cell : -1)).filter(c => c >= 0);
        const focusing = targets.length > 0 || selected.length > 0;
        $('#board').className = `board ${focusing ? 'focusing' : ''}`;
        $('#board').innerHTML = view.board.map((token, cell) => {
            const cls = [
                token ? 'filled' : 'empty',
                selected.includes(cell) ? 'selected' : '',
                targets.includes(cell) ? 'target' : ''
            ].join(' ');
            return `<button class="cell ${cls}" data-cell="${cell}" aria-label="${token ? COLOR_NAMES[token] : '空き'}">${token ? tokenChip(token) : ''}</button>`;
        }).join('');
    }

    renderMe() {
        const view = this.view;
        const me = this.me;
        const mine = this.myTurn();
        const active = view.current === view.you && view.phase !== 'end';
        const sel = this.selection;
        const reserved = Array.from({ length: RESERVE_LIMIT }, (_, i) => {
            const r = me.reserved[i];
            if (!r) return '<div class="slot-empty mini"></div>';
            const affordable = mine && view.affordable.includes(r.id);
            const selected = sel?.kind === 'card' && sel.card === r.id;
            return cardHtml(r.id, { cls: `mini ${affordable ? 'affordable' : ''} ${selected ? 'selected' : ''}`, attrs: 'role="button"' });
        }).join('');
        const el = $('#me');
        el.className = `me ${active ? 'active' : ''}`;
        el.dataset.player = view.you;
        el.innerHTML = `
            <div class="me-head" role="button" aria-label="自分の持ち物">${this.statsHtml(me)}</div>
            <div class="me-gems ${this.myTurn('discard') ? 'discarding' : ''}">${this.gemCells(me, { me: true })}
                <div class="me-reserved" data-reserved>${reserved}</div>
            </div>`;
    }

    renderActions() {
        const view = this.view;
        const me = this.me;
        const sel = this.selection;
        const cancel = '<button class="btn small ghost" data-act="cancel" aria-label="やめる">×</button>';
        let html;
        if (this.myTurn('discard')) {
            const total = Object.values(this.discardPick).reduce((s, n) => s + n, 0);
            const chips = Object.entries(this.discardPick).flatMap(([c, n]) => Array.from({ length: n }, () => `<button class="chip-btn" data-act="unpick" data-color="${c}">${tokenChip(c)}</button>`)).join('');
            html = `<span class="act-label">返す <b>${total}/${view.discardCount}</b></span><span class="act-chips">${chips}</span>
                <button class="btn small primary" data-act="discard" ${total === view.discardCount ? '' : 'disabled'}>返す</button>`;
        } else if (this.myTurn('choose')) {
            const choice = view.choice;
            if (choice.type === 'token') html = `<span class="act-label">${tokenChip(choice.color)}盤から1個取る</span>`;
            else html = `<span class="act-label">${{ wild: '色を写す', steal: '相手から盗む', royal: '王族のカード' }[choice.type]}</span>
                <button class="btn small primary" data-act="choose">選ぶ</button>`;
        } else if (sel?.kind === 'cells') {
            const chips = sel.cells.map(cell => tokenChip(view.board[cell])).join('');
            const privilege = sel.cells.length === 1 && me.privileges > 0 && !view.replenished
                ? `<button class="btn small secondary" data-act="privilege">${lineIcon('privilege', 'btn-icon')}特権で</button>` : '';
            html = `<span class="act-chips">${chips}</span>
                <button class="btn small primary" data-act="take">取る</button>${privilege}${cancel}`;
        } else if (sel?.kind === 'card') {
            const affordable = view.affordable.includes(sel.card);
            const canReserve = !sel.reserved && me.reserved.length < RESERVE_LIMIT && view.board.includes(GOLD);
            html = `<span class="act-card">${cardHtml(sel.card, { cls: 'tiny' })}</span>
                <button class="btn small primary" data-act="buy" ${affordable ? '' : 'disabled'}>買う</button>
                ${sel.reserved ? '' : `<button class="btn small secondary" data-act="reserve" ${canReserve ? '' : 'disabled'}>予約</button>`}${cancel}`;
        } else if (sel?.kind === 'deck') {
            const canReserve = me.reserved.length < RESERVE_LIMIT && view.board.includes(GOLD);
            html = `<span class="act-card">${cardBackHtml(sel.level, { cls: 'tiny' })}</span>
                <button class="btn small secondary" data-act="reserve-deck" ${canReserve ? '' : 'disabled'}>予約</button>${cancel}`;
        } else if (sel?.kind === 'gold') {
            html = `<span class="act-label">取る${tokenChip(GOLD)}を盤から選ぶ</span>${cancel}`;
        } else if (sel?.kind === 'replenish') {
            html = `<span class="act-label">相手が特権を得る</span>
                <button class="btn small primary" data-act="replenish">補充</button>${cancel}`;
        } else {
            // 何も選んでいないときは、最後の出来事を1行で控えめに出す
            html = `<span class="act-log">${escapeHtml(view.logs.at(-1) ?? '')}</span>`;
        }
        $('#actions').innerHTML = html;
    }

    // ---- ダイアログ ----

    // 能力の選択のシート。force：操作の欄の「選ぶ」から開いたとき
    showChoice(force) {
        const dialog = $('#choice');
        const choice = this.myTurn('choose') ? this.view.choice : null;
        if (!choice || choice.type === 'token') {
            if (dialog.open) dialog.close();
            return;
        }
        const key = `${this.view.turn}:${choice.type}:${this.view.events.at(-1)?.seq}`;
        if (dialog.open || (!force && this.choiceShownFor === key)) return;
        this.choiceShownFor = key;
        const me = this.me;
        const opponent = this.view.players[1 - this.view.you];
        if (choice.type === 'wild') {
            const card = CARDS[choice.card];
            $('#choice-title').textContent = '色を写す';
            $('#choice-text').innerHTML = `${cardHtml(card.id, { cls: 'choice-card' })}<span>このカードのボーナスの色を、持っている色から選びます</span>`;
            $('#choice-options').innerHTML = choice.options.map(c => `<button class="option" data-option="${c}">
                ${gemIcon(c)}<span>ボーナス${me.bonuses[c]}<br>${me.colorPoints[c]}点${card.points ? `→${me.colorPoints[c] + card.points}点` : ''}</span></button>`).join('');
        } else if (choice.type === 'steal') {
            $('#choice-title').textContent = '相手から盗む';
            $('#choice-text').innerHTML = `<span>${escapeHtml(opponent.name)}の宝石かパールを1個取ります</span>`;
            $('#choice-options').innerHTML = choice.options.map(c => `<button class="option" data-option="${c}">
                ${tokenChip(c, opponent.tokens[c])}<span>${COLOR_NAMES[c]}</span></button>`).join('');
        } else if (choice.type === 'royal') {
            $('#choice-title').textContent = '王族のカードを取る';
            $('#choice-text').innerHTML = `<span>王冠が${me.crowns}個になりました</span>`;
            $('#choice-options').innerHTML = choice.options.map(id => {
                const royal = ROYALS[id];
                return `<button class="option royal-option" data-option="${id}">${royalHtml(id)}
                    <span>${royal.points}点${royal.ability ? `<br>${ABILITY_NAMES[royal.ability]}` : ''}</span></button>`;
            }).join('');
        }
        this.markHint();
        dialog.showModal();
    }

    // ---- ヒント ----

    // おすすめの手を、トークン・カードを選んだ状態にして、押すボタンに印を付ける（画面だけ。記録には入れず、自分が動いたら消す）
    showHint() {
        const command = this.controller?.hint();
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.hintCommand = command;
        if (command.type === 'take') this.selection = { kind: 'cells', cells: [...command.cells] };
        if (command.type === 'privilege') this.selection = { kind: 'cells', cells: [command.cell] };
        if (command.type === 'buy' || (command.type === 'reserve' && command.card !== undefined)) {
            this.selection = { kind: 'card', card: command.card, reserved: this.me.reserved.some(r => r.id === command.card) };
        }
        if (command.type === 'reserve' && command.level !== undefined) this.selection = { kind: 'deck', level: command.level };
        if (command.type === 'replenish') this.selection = { kind: 'replenish' };
        if (command.type === 'discard') this.discardPick = { ...command.tokens };
        this.render();
        const text = {
            take: () => `選んだトークン${command.cells.length}個を取る`,
            privilege: () => '特権で、選んだトークンを取る',
            buy: () => '選んだカードを買う',
            reserve: () => (command.level !== undefined ? `レベル${command.level}の山札から予約する` : '選んだカードを予約する'),
            replenish: () => '盤を補充する',
            discard: () => 'トークンを返す',
            wild: () => `${COLOR_NAMES[command.color]}として置く`,
            steal: () => `${COLOR_NAMES[command.color]}をもらう`,
            royal: () => '金の枠の王族を迎える',
            token: () => '金の枠のトークンを取る',
            pass: () => 'パスする'
        }[command.type]?.() ?? '';
        this.toast(`おすすめ：${text}`);
    }

    markHint() {
        const c = this.hintCommand;
        if (!c) return;
        const act = { take: 'take', privilege: 'privilege', buy: 'buy', reserve: c.level !== undefined ? 'reserve-deck' : 'reserve', replenish: 'replenish', discard: 'discard' }[c.type];
        const list = act ? [`#actions [data-act="${act}"]`] : [];
        if (c.type === 'reserve' && this.selection?.kind === 'gold') list.push(`#board [data-cell="${c.gold}"]`);
        if (c.type === 'token') list.push(`#board [data-cell="${c.cell}"]`);
        if (['wild', 'steal', 'royal'].includes(c.type)) list.push(`#choice-options [data-option="${c.color ?? c.royal}"]`);
        list.forEach(s => document.querySelector(s)?.classList.add('recommended'));
    }

    showPlayerDetail(seat) {
        const view = this.view;
        if (!view) return;
        const p = view.players[seat];
        $('#player-detail-name').textContent = p.name;
        const reserved = p.reserved.length
            ? p.reserved.map(r => (r.id === null ? cardBackHtml(r.level, { cls: 'detail-card' }) : cardHtml(r.id, { cls: 'detail-card' }))).join('')
            : '<span class="muted">なし</span>';
        const royals = p.royals.length ? p.royals.map(id => royalHtml(id)).join('') : '<span class="muted">なし</span>';
        const colors = COLORS.map(c => `<span class="color-stat">${gemIcon(c)}<span>ボーナス<b>${p.bonuses[c]}</b></span><span><b>${p.colorPoints[c]}</b>点</span></span>`).join('');
        $('#player-detail-body').innerHTML = `
            <div class="detail-stats">${this.statsHtml(p)}<span class="muted">カード${p.cards.length}枚</span></div>
            <h3>色ごと（同じ色で${WIN_COLOR_POINTS}点で勝ち）</h3><div class="detail-row colors">${colors}</div>
            <h3>予約</h3><div class="detail-row">${reserved}</div>
            <h3>王族のカード</h3><div class="detail-row">${royals}</div>`;
        $('#player-detail').showModal();
    }

    showResult() {
        const view = this.view;
        if (!view || view.phase !== 'end') return;
        const youWon = view.winners.includes(view.you);
        $('#result-title').textContent = view.winners.length > 1 ? '引き分け' : youWon ? 'あなたの勝ち' : `${view.players[view.winners[0]].name}の勝ち`;
        $('#result-reason').textContent = REASON_TEXT[view.endReason] ?? '';
        $('#result-list').innerHTML = view.players.map(p => `<li class="${view.winners.includes(p.id) ? 'winner' : ''}">
            <span class="r-name">${escapeHtml(p.name)}</span><span class="r-pts"><b>${p.points}</b>点</span>
            <span class="r-sub">王冠${p.crowns}・カード${p.cards.length}枚</span></li>`).join('');
        $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
    }
}
