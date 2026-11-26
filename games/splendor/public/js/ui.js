/**
 * 画面（タイトル・ゲーム・結果・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 */

import { CARDS, NOBLES, COLORS, GOLD, TOKEN_COLORS, LEVELS, RESERVE_LIMIT, canAfford, countTokens } from './game.js';
import { COLOR_NAMES } from './cards.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { gemSymbolsSvg, tokenChip, cardHtml, cardBackHtml, nobleHtml, gemIcon } from './art.js';
import { captureAnchors, playEvents } from './animator.js';
import { music } from './music.js';

const SETTINGS_KEY = 'splendor.settings';
const CPU_NAMES = ['エレナ', 'マルコ', 'ルカ'];
const AUTO_PASS_DELAY_MS = 600;
const RESULT_DELAY_MS = 900;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return { count: [2, 3, 4].includes(saved.count) ? saved.count : 2 };
    } catch {
        return { count: 2 };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// 黄金のほかに、手番の操作が1つでもできるか（ビューから判断する）
function hasAnyAction(view, me) {
    if (COLORS.some(c => view.bank[c] > 0)) return true;
    const boardCards = LEVELS.flatMap(l => view.board[l]).filter(id => id !== null);
    if (me.reserved.length < RESERVE_LIMIT && (boardCards.length > 0 || LEVELS.some(l => view.deckCounts[l] > 0))) return true;
    return [...boardCards, ...me.reserved.map(r => r.id)].some(id => id !== null && canAfford(me, CARDS[id]));
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.selection = null;    // { kind: 'tokens', tokens } / { kind: 'card', card, reserved } / { kind: 'deck', level }
        this.discardPick = {};     // 返す宝石
        this.lastSeq = 0;          // 演出を済ませたイベントの番号
        this.autoTimer = null;
        this.resultTimer = null;
        $('#gem-symbols').innerHTML = gemSymbolsSvg();
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
        this.renderCountSelect();
    }

    startGame(setup) {
        this.stopGame();
        try {
            this.controller = new LocalGameController(setup, {
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
        this.selection = null;
        this.discardPick = {};
        this.view = null;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        const view = this.controller.getView();
        this.lastSeq = view.events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は動かさない
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        const count = this.settings.count;
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true }))];
        this.startGame({ players, options: {} });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.autoTimer);
        clearTimeout(this.resultTimer);
        ['#result', '#noble-choice', '#player-detail'].forEach(id => { if ($(id).open) $(id).close(); });
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#player-count').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-count]');
            if (!button) return;
            this.settings.count = Number(button.dataset.count);
            saveSettings(this.settings);
            this.renderCountSelect();
        });
        $('#start').addEventListener('click', () => this.newGame());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => this.newGame());
        $('#result-home').addEventListener('click', () => this.showTitle());
        $('#home').addEventListener('click', () => this.showTitle());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#hint').addEventListener('click', () => this.showHint());

        // ダイアログは外側のタップと「閉じる」で閉じる（結果と貴族の選択は、外側では閉じない）
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            if (dialog.id === 'result' || dialog.id === 'noble-choice') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        $('#bank').addEventListener('click', (event) => {
            const chip = event.target.closest('[data-bank]');
            if (chip) this.pickToken(chip.dataset.bank);
        });
        $('#board').addEventListener('click', (event) => {
            const deck = event.target.closest('[data-deck]');
            if (deck) return this.pickDeck(Number(deck.dataset.deck));
            const card = event.target.closest('.card[data-card]');
            if (card) this.pickCard(Number(card.dataset.card), false);
        });
        $('#me').addEventListener('click', (event) => {
            const card = event.target.closest('.card[data-card]');
            if (card) return this.pickCard(Number(card.dataset.card), true);
            const gem = event.target.closest('[data-me-color]');
            if (gem) this.pickDiscard(gem.dataset.meColor);
        });
        $('#opponents').addEventListener('click', (event) => {
            const row = event.target.closest('[data-player]');
            if (row) this.showPlayerDetail(Number(row.dataset.player));
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            this.act(button.dataset.act, button.dataset);
        });
        $('#noble-options').addEventListener('click', (event) => {
            const noble = event.target.closest('[data-noble]');
            if (!noble) return;
            $('#noble-choice').close();
            this.controller?.send({ type: 'noble', noble: Number(noble.dataset.noble) });
        });

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    renderCountSelect() {
        document.querySelectorAll('#player-count button').forEach(button => {
            button.setAttribute('aria-checked', String(Number(button.dataset.count) === this.settings.count));
        });
    }

    renderTitleArt() {
        const cards = [CARDS.find(c => c.level === 3 && c.bonus === 'red' && c.points === 4), CARDS.find(c => c.level === 3 && c.bonus === 'blue' && c.points === 5), CARDS.find(c => c.level === 2 && c.bonus === 'green' && c.points === 3)];
        $('#title-art').innerHTML = `<div class="fan">${cards.map((c, i) => cardHtml(c.id, { cls: `fan-${i}` })).join('')}</div>
            <div class="title-chips">${['white', 'blue', 'green', 'red', 'black', 'gold'].map(c => tokenChip(c)).join('')}</div>`;
    }

    renderHelpPictures() {
        $('#help-take3').innerHTML = ['white', 'blue', 'red'].map(c => tokenChip(c)).join('');
        $('#help-take2').innerHTML = tokenChip('green') + tokenChip('green');
        $('#help-reserve').innerHTML = cardBackHtml(2, { cls: 'tiny' }) + tokenChip('gold');
        const card = CARDS.find(c => c.level === 1 && c.bonus === 'black' && c.points === 1);
        $('#help-buy').innerHTML = cardHtml(card.id, { cls: 'tiny' });
    }

    // ---- 選ぶ操作 ----

    myTurn(phase = 'action') {
        const view = this.view;
        return view && view.phase === phase && view.current === view.you;
    }

    pickToken(color) {
        if (!this.myTurn() || color === GOLD || this.view.bank[color] === 0) return;
        const current = this.selection?.kind === 'tokens' ? { ...this.selection.tokens } : {};
        const colors = Object.keys(current);
        if (current[color] === 1 && colors.length === 1 && this.view.bank[color] >= 4) current[color] = 2;
        else if (current[color]) delete current[color];
        else if (colors.some(c => current[c] === 2)) {
            Object.keys(current).forEach(c => delete current[c]);
            current[color] = 1;
        } else {
            if (colors.length >= 3) delete current[colors[0]];
            current[color] = 1;
        }
        this.selection = Object.keys(current).length ? { kind: 'tokens', tokens: current } : null;
        music.play(current[color] ? 'select' : 'cancel');
        this.render();
    }

    takeIsValid(tokens) {
        const colors = Object.keys(tokens);
        if (colors.length === 1 && tokens[colors[0]] === 2) return this.view.bank[colors[0]] >= 4;
        const available = COLORS.filter(c => this.view.bank[c] > 0).length;
        return colors.length > 0 && colors.length === Math.min(3, available);
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

    pickDiscard(color) {
        if (!this.myTurn('discard')) return;
        const me = this.view.players[this.view.you];
        const picked = this.discardPick[color] ?? 0;
        const total = countTokens({ ...Object.fromEntries(TOKEN_COLORS.map(c => [c, 0])), ...this.discardPick });
        if (picked < me.tokens[color] && total < this.view.discardCount) this.discardPick[color] = picked + 1;
        else delete this.discardPick[color];
        music.play(this.discardPick[color] ? 'select' : 'cancel');
        this.render();
    }

    act(action, data) {
        const sel = this.selection;
        const send = (command) => {
            this.selection = null;
            this.hintCommand = null;
            this.controller?.send(command);
        };
        if (action === 'cancel') {
            music.play('cancel');
            this.selection = null;
            this.discardPick = {};
            this.render();
        } else if (action === 'take' && sel?.kind === 'tokens') send({ type: 'take', tokens: sel.tokens });
        else if (action === 'buy' && sel?.kind === 'card') send({ type: 'buy', card: sel.card });
        else if (action === 'reserve' && sel?.kind === 'card') send({ type: 'reserve', card: sel.card });
        else if (action === 'reserve-deck' && sel?.kind === 'deck') send({ type: 'reserve', level: sel.level });
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
        const mine = fresh.filter(e => e.seat === view.you && e.type !== 'turn').map(e => e.type);
        if (mine.includes('noble') || mine.includes('take')) return music.play('gain');
        if (mine.includes('buy')) return music.play('place');
        if (mine.includes('reserve')) return music.play('draw');
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

        this.renderOpponents();
        this.renderNobles();
        this.renderBoard();
        this.renderBank();
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
        const me = view.players[view.you];
        if (sel.kind === 'card') {
            const onBoard = LEVELS.some(l => view.board[l].includes(sel.card));
            const inHand = me.reserved.some(r => r.id === sel.card);
            if (!(sel.reserved ? inHand : onBoard)) this.selection = null;
        }
        if (sel.kind === 'deck' && view.deckCounts[sel.level] === 0) this.selection = null;
        if (sel.kind === 'tokens' && Object.keys(sel.tokens).some(c => view.bank[c] < sel.tokens[c])) this.selection = null;
    }

    afterRender() {
        const view = this.view;
        clearTimeout(this.autoTimer);
        // できることが何もなければ、少し間を置いてパスする
        if (this.myTurn() && !hasAnyAction(view, view.players[view.you])) {
            this.autoTimer = setTimeout(() => {
                if (this.myTurn() && !hasAnyAction(this.view, this.view.players[this.view.you])) this.controller?.send({ type: 'pass' });
            }, AUTO_PASS_DELAY_MS);
        }
        if (view.nobleChoices.length > 0) this.showNobleChoice(view.nobleChoices);
        else if ($('#noble-choice').open) $('#noble-choice').close();
        if (view.phase === 'end' && !$('#result').open) {
            clearTimeout(this.resultTimer);
            this.resultTimer = setTimeout(() => this.showResult(), RESULT_DELAY_MS);
        }
    }

    gemCells(player, { me = false } = {}) {
        const cells = COLORS.map(c => {
            const picked = me ? (this.discardPick[c] ?? 0) : 0;
            return `<span class="gc gc-${c} ${picked ? 'picked' : ''}" ${me ? `data-me-color="${c}"` : ''}>
                <b class="bon ${player.bonuses[c] === 0 ? 'zero' : ''}">${player.bonuses[c]}</b>${tokenChip(c, player.tokens[c] - picked, player.tokens[c] - picked === 0 ? 'empty' : '')}
            </span>`;
        });
        const goldPicked = me ? (this.discardPick[GOLD] ?? 0) : 0;
        cells.push(`<span class="gc gc-gold ${goldPicked ? 'picked' : ''}" ${me ? `data-me-color="${GOLD}"` : ''}>
            ${tokenChip(GOLD, player.tokens[GOLD] - goldPicked, player.tokens[GOLD] - goldPicked === 0 ? 'empty' : '')}</span>`);
        return cells.join('');
    }

    renderOpponents() {
        const view = this.view;
        const order = view.players.map((_, i) => (view.you + 1 + i) % view.players.length).filter(i => i !== view.you);
        $('#opponents').innerHTML = order.map(seat => {
            const p = view.players[seat];
            const active = view.current === seat && view.phase !== 'end';
            return `<button class="opp ${active ? 'active' : ''}" data-player="${seat}" aria-label="${escapeHtml(p.name)}の持ち物">
                <span class="opp-name">${escapeHtml(p.name)}</span>
                <span class="opp-pts">${p.points}</span>
                <span class="opp-gems">${this.gemCells(p)}</span>
                <span class="opp-extra">
                    <span class="mini-back" title="予約">${p.reserved.length}</span>
                    <span class="mini-noble" title="貴族">${p.nobles.length}</span>
                </span>
            </button>`;
        }).join('');
    }

    renderNobles() {
        const view = this.view;
        const final = view.finalRound && view.phase !== 'end' ? '<span class="final-badge">最後の巡</span>' : '';
        $('#nobles').innerHTML = view.nobles.map(id => nobleHtml(id)).join('') + final;
    }

    renderBoard() {
        const view = this.view;
        const me = view.players[view.you];
        const mine = this.myTurn();
        const sel = this.selection;
        $('#board').innerHTML = [3, 2, 1].map(level => {
            const deckSelected = sel?.kind === 'deck' && sel.level === level;
            const deck = view.deckCounts[level] > 0
                ? cardBackHtml(level, { cls: `deck ${deckSelected ? 'selected' : ''}`, attrs: `data-deck="${level}" role="button"`, count: view.deckCounts[level] })
                : `<div class="slot-empty deck-empty" data-deck-empty="${level}"></div>`;
            const slots = view.board[level].map((id, slot) => {
                const key = `data-slot="${level}-${slot}"`;
                if (id === null) return `<div class="slot-empty" ${key}></div>`;
                const affordable = mine && canAfford(me, CARDS[id]);
                const selected = sel?.kind === 'card' && sel.card === id;
                return `<div class="slot" ${key}>${cardHtml(id, { cls: `${affordable ? 'affordable' : ''} ${selected ? 'selected' : ''}`, attrs: 'role="button"' })}</div>`;
            }).join('');
            return `<div class="board-row">${deck}${slots}</div>`;
        }).join('');
    }

    renderBank() {
        const view = this.view;
        const picked = this.selection?.kind === 'tokens' ? this.selection.tokens : {};
        const mine = this.myTurn();
        $('#bank').innerHTML = TOKEN_COLORS.map(c => {
            const n = picked[c] ?? 0;
            const badge = n ? `<span class="pick-badge">${n}</span>` : '';
            const usable = mine && c !== GOLD && view.bank[c] > 0;
            return `<button class="bank-chip ${n ? 'picked' : ''} ${usable ? 'usable' : ''}" data-bank="${c}" aria-label="${c}"
                ${c === GOLD ? 'tabindex="-1"' : ''}>${tokenChip(c, view.bank[c] - n, view.bank[c] - n === 0 ? 'empty' : '')}${badge}</button>`;
        }).join('');
    }

    renderMe() {
        const view = this.view;
        const me = view.players[view.you];
        const mine = this.myTurn();
        const active = view.current === view.you && view.phase !== 'end';
        const sel = this.selection;
        const reserved = Array.from({ length: RESERVE_LIMIT }, (_, i) => {
            const r = me.reserved[i];
            if (!r) return '<div class="slot-empty mini"></div>';
            const affordable = mine && canAfford(me, CARDS[r.id]);
            const selected = sel?.kind === 'card' && sel.card === r.id;
            return cardHtml(r.id, { cls: `mini ${affordable ? 'affordable' : ''} ${selected ? 'selected' : ''} ${r.hidden ? 'was-hidden' : ''}`, attrs: 'role="button"' });
        }).join('');
        const nobles = me.nobles.length ? `<span class="me-nobles">${me.nobles.map(id => nobleHtml(id, { cls: 'tiny' })).join('')}</span>` : '';
        $('#me').className = `me ${active ? 'active' : ''}`;
        $('#me').dataset.player = view.you;
        $('#me').innerHTML = `
            <div class="me-head"><span class="me-name">${escapeHtml(me.name)}</span>${nobles}<span class="me-pts"><b>${me.points}</b>点</span></div>
            <div class="me-body">
                <div class="me-gems ${this.myTurn('discard') ? 'discarding' : ''}">${this.gemCells(me, { me: true })}</div>
                <div class="me-reserved">${reserved}</div>
            </div>`;
    }

    renderActions() {
        const view = this.view;
        const me = view.players[view.you];
        const sel = this.selection;
        const cancel = '<button class="btn small ghost" data-act="cancel" aria-label="やめる">×</button>';
        let html;
        if (this.myTurn('discard')) {
            const total = Object.values(this.discardPick).reduce((s, n) => s + n, 0);
            const chips = Object.entries(this.discardPick).flatMap(([c, n]) => Array.from({ length: n }, () => `<button class="chip-btn" data-act="unpick" data-color="${c}">${tokenChip(c)}</button>`)).join('');
            html = `<span class="act-label">宝石を返す <b>${total}/${view.discardCount}</b></span><span class="act-chips">${chips}</span>
                <button class="btn small primary" data-act="discard" ${total === view.discardCount ? '' : 'disabled'}>返す</button>`;
        } else if (sel?.kind === 'tokens') {
            const chips = Object.entries(sel.tokens).flatMap(([c, n]) => Array.from({ length: n }, () => tokenChip(c))).join('');
            html = `<span class="act-chips">${chips}</span>
                <button class="btn small primary" data-act="take" ${this.takeIsValid(sel.tokens) ? '' : 'disabled'}>取る</button>${cancel}`;
        } else if (sel?.kind === 'card') {
            const affordable = canAfford(me, CARDS[sel.card]);
            const canReserve = !sel.reserved && me.reserved.length < RESERVE_LIMIT;
            html = `<span class="act-card">${cardHtml(sel.card, { cls: 'tiny' })}</span>
                <button class="btn small primary" data-act="buy" ${affordable ? '' : 'disabled'}>買う</button>
                ${sel.reserved ? '' : `<button class="btn small secondary" data-act="reserve" ${canReserve ? '' : 'disabled'}>予約</button>`}${cancel}`;
        } else if (sel?.kind === 'deck') {
            const canReserve = me.reserved.length < RESERVE_LIMIT;
            html = `<span class="act-card">${cardBackHtml(sel.level, { cls: 'tiny' })}</span>
                <button class="btn small secondary" data-act="reserve-deck" ${canReserve ? '' : 'disabled'}>山札から予約</button>${cancel}`;
        } else {
            // 何も選んでいないときは、最後の出来事を1行で控えめに出す
            const last = view.logs.at(-1) ?? '';
            html = `<span class="act-log">${escapeHtml(last)}</span>`;
        }
        $('#actions').innerHTML = html;
    }

    // ---- ダイアログ ----

    showNobleChoice(choices) {
        const best = this.hintCommand?.type === 'noble' ? this.hintCommand.noble : null;
        $('#noble-options').innerHTML = choices.map(id => `<button class="noble-pick${id === best ? ' recommended' : ''}" data-noble="${id}">${nobleHtml(id)}</button>`).join('');
        if (!$('#noble-choice').open) $('#noble-choice').showModal();
    }

    showPlayerDetail(seat) {
        const p = this.view.players[seat];
        $('#player-detail-name').textContent = `${p.name}　${p.points}点`;
        const reserved = p.reserved.length
            ? p.reserved.map(r => (r.id === null ? cardBackHtml(r.level, { cls: 'detail-card' }) : cardHtml(r.id, { cls: 'detail-card' }))).join('')
            : '<span class="muted">なし</span>';
        const nobles = p.nobles.length ? p.nobles.map(id => nobleHtml(id)).join('') : '<span class="muted">なし</span>';
        $('#player-detail-body').innerHTML = `
            <h3>予約</h3><div class="detail-row">${reserved}</div>
            <h3>貴族</h3><div class="detail-row">${nobles}</div>
            <h3>カード ${p.cards.length}枚</h3>
            <div class="detail-row bonuses">${COLORS.map(c => `<span class="bonus-count">${gemIcon(c)}${p.bonuses[c]}</span>`).join('')}</div>`;
        $('#player-detail').showModal();
    }

    showResult() {
        const view = this.view;
        if (!view || view.phase !== 'end') return;
        const ranked = [...view.players].sort((a, b) => b.points - a.points || a.cards.length - b.cards.length);
        const youWon = view.winners.includes(view.you);
        $('#result-title').textContent = youWon ? (view.winners.length > 1 ? '引き分け' : 'あなたの勝ち') : `${view.winners.map(id => view.players[id].name).join('と')}の勝ち`;
        $('#result-list').innerHTML = ranked.map(p => `<li class="${view.winners.includes(p.id) ? 'winner' : ''}">
            <span class="r-name">${escapeHtml(p.name)}</span><span class="r-pts"><b>${p.points}</b>点</span>
            <span class="r-sub">カード${p.cards.length}枚・貴族${p.nobles.length}</span></li>`).join('');
        $('#result').showModal();
    }

    // ---- ヒント ----

    // おすすめの手を、宝石・カードを選んだ状態にして、押すボタンに印を付ける（画面だけ。記録には入れず、自分が動いたら消す）
    showHint() {
        const command = this.controller?.hint();
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.hintCommand = command;
        const me = this.view.players[this.view.you];
        if (command.type === 'take') this.selection = { kind: 'tokens', tokens: { ...command.tokens } };
        if (command.type === 'buy' || (command.type === 'reserve' && command.card !== undefined)) {
            this.selection = { kind: 'card', card: command.card, reserved: me.reserved.some(r => r.id === command.card) };
        }
        if (command.type === 'reserve' && command.level !== undefined) this.selection = { kind: 'deck', level: command.level };
        if (command.type === 'discard') this.discardPick = { ...command.tokens };
        this.render();
        if (command.type === 'noble' && $('#noble-choice').open) this.showNobleChoice([...$('#noble-options').querySelectorAll('[data-noble]')].map(b => Number(b.dataset.noble)));
        const gems = (tokens) => Object.entries(tokens).map(([c, n]) => `${COLOR_NAMES[c]}${n > 1 ? `×${n}` : ''}`).join('・');
        const text = {
            take: () => `宝石を取る（${gems(command.tokens)}）`,
            buy: () => '選んだカードを買う',
            reserve: () => (command.level !== undefined ? `レベル${command.level}の山札から予約する` : '選んだカードを予約する'),
            discard: () => `宝石を返す（${gems(command.tokens)}）`,
            noble: () => '金の枠の貴族を迎える',
            pass: () => 'パスする'
        }[command.type]?.() ?? '';
        this.toast(`おすすめ：${text}`);
    }

    markHint() {
        const c = this.hintCommand;
        if (!c) return;
        const act = { take: 'take', buy: 'buy', reserve: c.level !== undefined ? 'reserve-deck' : 'reserve', discard: 'discard' }[c.type];
        if (act) document.querySelector(`#actions [data-act="${act}"]`)?.classList.add('recommended');
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
    }
}
