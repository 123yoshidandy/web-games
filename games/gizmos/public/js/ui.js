/**
 * 画面（タイトル・ゲーム・研究・結果・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 */

import { CARDS, COLORS, LEVELS, TYPE_NAMES, costFor, convertersOf, countEnergy, isAutomatic, MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import { TYPES } from './cards.js';
import { spendOptions } from './payment.js';
import { cardText, cardTitle, effectText } from './card-text.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS, suggest } from './cpu-player.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl, GAME } from './online-config.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { symbolsSvg, sphere, cardHtml, cardBackHtml, tileHtml, icon, typeIcon } from './art.js';
import { captureAnchors, playEvents, resetTicker } from './animator.js';

const SETTINGS_KEY = 'gizmos.settings';
const CPU_NAMES = ['ハル', 'ミオ', 'ソウ'];
const AUTO_PASS_DELAY_MS = 600;
const RESULT_DELAY_MS = 1200;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

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

// ---- ビューから判断する道具 ----

const displayCards = (view) => LEVELS.flatMap(level => view.display[level]).filter(id => id !== null);
const storageRoom = (p) => p.limits.storage - countEnergy(p.energy);
const canArchive = (p) => !p.blocked.file && p.archive.length < p.limits.archive;

// 払い方の候補（建てられなければ空）
function payOptions(view, me, cardId, source) {
    const card = CARDS[cardId];
    return spendOptions(me.energy, convertersOf(me, view.used), card.color, costFor(me, card, source));
}

function hasAnyAction(view, me) {
    if (canArchive(me) && displayCards(view).length > 0) return true;
    if (storageRoom(me) > 0 && view.row.some(Boolean)) return true;
    if (!me.blocked.research && LEVELS.some(l => view.deckCounts[l] > 0)) return true;
    return [...displayCards(view).map(id => [id, 'display']), ...me.archive.map(id => [id, 'archive'])]
        .some(([id, source]) => payOptions(view, me, id, source).length > 0);
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.selection = null;    // { kind: 'card', card, source } / { kind: 'slot', slot } / { kind: 'deck', level }
        this.payIndex = 0;        // 選んだ払い方
        this.chainGizmo = null;   // 連鎖で使うギズモ
        this.researchCard = null; // 研究で選んだカード
        this.lastSeq = 0;         // 演出を済ませたイベントの番号
        this.autoTimer = null;
        this.resultTimer = null;
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'ギズモ',
            game: 'gizmos',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 800,
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
        this.hint = null;
        this.clearChoices();
        this.view = null;
        resetTicker();
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
        const { count, level } = this.settings;
        const players = [{ name: 'あなた', isCPU: false },
            ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true, cpuLevel: level }))];
        this.startGame({ players, options: {} });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.autoTimer);
        clearTimeout(this.resultTimer);
        ['#result', '#research', '#player-detail', '#card-detail'].forEach(id => { if ($(id).open) $(id).close(); });
    }

    clearChoices() {
        this.selection = null;
        this.payIndex = 0;
        this.chainGizmo = null;
        this.researchCard = null;
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
        $('#again').addEventListener('click', () => {
            if (!this.controller?.isOnline) return this.newGame();
            $('#result').close();
            this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
        });
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        $('#home').addEventListener('click', () => this.goHome());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());

        // ダイアログは外側のタップと「閉じる」で閉じる（結果と研究は、外側では閉じない）
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            if (dialog.id === 'result' || dialog.id === 'research') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        $('#hint').addEventListener('click', () => this.showHint());
        $('#display').addEventListener('click', (event) => {
            const deck = event.target.closest('[data-deck]');
            if (deck) return this.tapDeck(Number(deck.dataset.deck));
            const card = event.target.closest('.card[data-card]');
            if (card) this.tapCard(Number(card.dataset.card), 'display');
        });
        $('#row').addEventListener('click', (event) => {
            const slot = event.target.closest('[data-pick]');
            if (slot) this.tapSlot(Number(slot.dataset.pick));
        });
        $('#me').addEventListener('click', (event) => {
            const card = event.target.closest('.card[data-card]');
            if (card) return this.tapCard(Number(card.dataset.card), 'archive');
            const tile = event.target.closest('[data-tile]');
            if (tile) this.showCardDetail(Number(tile.dataset.tile));
        });
        $('#opponents').addEventListener('click', (event) => {
            const chip = event.target.closest('[data-player]');
            if (chip) this.showPlayerDetail(Number(chip.dataset.player));
        });
        $('#player-detail-body').addEventListener('click', (event) => {
            const tile = event.target.closest('[data-tile], .card[data-card]');
            if (tile) this.showCardDetail(Number(tile.dataset.tile ?? tile.dataset.card));
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            this.act(button.dataset.act, button.dataset);
        });
        $('#research').addEventListener('click', (event) => {
            const card = event.target.closest('.card[data-card]');
            if (card) {
                this.researchCard = Number(card.dataset.card);
                this.payIndex = 0;
                return this.renderResearch();
            }
            const button = event.target.closest('button[data-act]');
            if (button && !button.disabled) this.act(button.dataset.act, button.dataset);
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
        const ids = [CARDS.find(c => c.level === 2 && c.type === 'converter' && c.color === 'red').id,
            CARDS.find(c => c.level === 3 && c.type === 'build' && c.effect.kind === 'freeBuild').id,
            CARDS.find(c => c.level === 1 && c.type === 'pick' && c.color === 'yellow').id];
        $('#title-art').innerHTML = `<div class="fan">${ids.map((id, i) => cardHtml(id, { cls: `fan-${i}` })).join('')}</div>
            <div class="title-spheres">${COLORS.map(c => sphere(c)).join('')}</div>`;
    }

    renderHelpPictures() {
        $('#help-file').innerHTML = icon('file');
        $('#help-pick').innerHTML = icon('pick');
        $('#help-build').innerHTML = icon('build');
        $('#help-research').innerHTML = icon('research');
    }

    // ---- 選ぶ操作 ----

    myTurn(phase = 'action') {
        const view = this.view;
        return !!view && view.phase === phase && view.current === view.you;
    }

    get me() {
        return this.view.players[this.view.you];
    }

    // 連鎖で選んでいるギズモの効果
    chainEffect() {
        if (!this.myTurn('chain') || this.chainGizmo === null) return null;
        return CARDS[this.chainGizmo].effect.kind;
    }

    tapCard(card, source) {
        const effect = this.chainEffect();
        if (effect === 'file' && source === 'display') return this.useChain({ card });
        if (effect === 'freeBuild' && CARDS[card].level === 1) return this.useChain({ card });
        if (!this.myTurn()) {
            if (source === 'display') this.showCardDetail(card);
            return;
        }
        const same = this.selection?.kind === 'card' && this.selection.card === card;
        music.play(same ? 'cancel' : 'select');
        this.selection = same ? null : { kind: 'card', card, source };
        this.payIndex = 0;
        this.render();
    }

    tapSlot(slot) {
        if (this.view.row[slot] === null) return;
        if (this.chainEffect() === 'pick') return this.useChain({ slot });
        if (!this.myTurn() || storageRoom(this.me) <= 0) return;
        const same = this.selection?.kind === 'slot' && this.selection.slot === slot;
        music.play(same ? 'cancel' : 'select');
        this.selection = same ? null : { kind: 'slot', slot };
        this.render();
    }

    tapDeck(level) {
        if (this.view.deckCounts[level] === 0) return;
        if (this.chainEffect() === 'research') return this.useChain({ level });
        if (!this.myTurn() || this.me.blocked.research) return;
        const same = this.selection?.kind === 'deck' && this.selection.level === level;
        music.play(same ? 'cancel' : 'select');
        this.selection = same ? null : { kind: 'deck', level };
        this.render();
    }

    useChain(target) {
        const gizmo = this.chainGizmo;
        this.chainGizmo = null;
        this.controller?.send({ type: 'use', gizmo, ...target });
    }

    send(command) {
        this.clearChoices();
        this.controller?.send(command);
    }

    act(action, data) {
        const sel = this.selection;
        const view = this.view;
        if (action === 'cancel') {
            music.play('cancel');
            this.selection = null;
            return this.render();
        }
        if (action === 'pay') {
            this.payIndex++;
            return this.myTurn('research') ? this.renderResearch() : this.render();
        }
        if (action === 'pick' && sel?.kind === 'slot') return this.send({ type: 'pick', slot: sel.slot });
        if (action === 'research' && sel?.kind === 'deck') return this.send({ type: 'research', level: sel.level });
        if (action === 'file' && sel?.kind === 'card') return this.send({ type: 'file', card: sel.card });
        if (action === 'build' && sel?.kind === 'card') {
            const options = payOptions(view, this.me, sel.card, sel.source);
            if (options.length === 0) return;
            return this.send({ type: 'build', card: sel.card, spend: options[this.payIndex % options.length].spend });
        }
        if (action === 'chain') {
            const gizmo = Number(data.gizmo);
            if (isAutomatic(CARDS[gizmo].effect)) return this.send({ type: 'use', gizmo });
            this.chainGizmo = this.chainGizmo === gizmo ? null : gizmo;
            return this.render();
        }
        if (action === 'stop') return this.send({ type: 'stop' });
        // 研究
        const card = this.researchCard;
        if (action === 'r-build' && card !== null) {
            const options = payOptions(view, this.me, card, 'research');
            if (options.length === 0) return;
            return this.send({ type: 'researchBuild', card, spend: options[this.payIndex % options.length].spend });
        }
        if (action === 'r-file' && card !== null) return this.send({ type: 'researchFile', card });
        if (action === 'r-skip') return this.send({ type: 'researchSkip' });
    }

    // ---- 描く ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const before = captureAnchors();
        this.view = view;
        this.validateChoices();

        this.renderOpponents();
        this.renderDisplay();
        this.renderRow();
        this.renderMe();
        this.renderActions();
        this.renderResearch();

        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        playEvents(fresh, before, { you: view.you, names: view.players.map(p => p.name) });
        this.playSound(fresh);
        this.markHint();

        this.afterRender();
    }

    // 選んでいたものが、場の変化でなくなったら選び直す
    validateChoices() {
        const view = this.view;
        if (!this.myTurn()) this.selection = null;
        const sel = this.selection;
        if (sel?.kind === 'card') {
            const here = sel.source === 'archive' ? this.me.archive.includes(sel.card) : displayCards(view).includes(sel.card);
            if (!here) this.selection = null;
        }
        if (sel?.kind === 'slot' && (view.row[sel.slot] === null || storageRoom(this.me) <= 0)) this.selection = null;
        if (sel?.kind === 'deck' && view.deckCounts[sel.level] === 0) this.selection = null;
        if (!this.myTurn('chain') || !view.pending.some(p => p.gizmo === this.chainGizmo)) this.chainGizmo = null;
        // 連鎖で選ぶものが1つだけなら、はじめから選んでおく
        if (this.myTurn('chain') && this.chainGizmo === null) {
            const choices = view.pending.filter(p => !p.auto);
            if (choices.length === 1) this.chainGizmo = choices[0].gizmo;
        }
        if (!this.myTurn('research') || !view.research?.cards?.includes(this.researchCard)) this.researchCard = null;
    }

    // 1つの更新に1つの音。自分の行動は結果の音、相手の行動は notify、自分の番になったら turn
    playSound(fresh) {
        const view = this.view;
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winners.includes(view.you) ? 'win' : 'lose');
        const mine = fresh.filter(e => e.seat === view.you).map(e => e.type);
        if (mine.includes('build')) return music.play('place');
        if (mine.includes('vp') || mine.includes('pick') || mine.includes('draw')) return music.play('gain');
        if (mine.includes('file')) return music.play('place');
        if (mine.includes('research')) return music.play('draw');
        if (fresh.some(e => e.type === 'turn' && e.seat === view.you)) return music.play('turn');
        if (fresh.some(e => e.seat !== undefined && e.seat !== view.you)) music.play('notify');
    }

    // ---- ヒント ----

    showHint() {
        const command = this.myTurn() && !this.controller?.isOnline ? suggest(this.controller.game, this.view.you) : null;
        if (!command) return;
        music.play('select');
        this.hint = { at: this.controller.game.commands.length, command };
        this.payIndex = 0;
        if (command.type === 'pick') this.selection = { kind: 'slot', slot: command.slot };
        else if (command.type === 'research') this.selection = { kind: 'deck', level: command.level };
        else if (command.type === 'file' || command.type === 'build') {
            const source = this.me.archive.includes(command.card) ? 'archive' : 'display';
            this.selection = { kind: 'card', card: command.card, source };
            if (command.type === 'build') {
                const index = payOptions(this.view, this.me, command.card, source).findIndex(o => JSON.stringify(o.spend) === JSON.stringify(command.spend));
                this.payIndex = Math.max(0, index);
            }
        } else this.selection = null;
        this.render();
    }

    // おすすめの操作のボタンに .recommended を付ける。盤面が進んだら消す
    markHint() {
        $('#hint').hidden = Boolean(this.controller?.isOnline); // ヒントはローカル対戦だけ
        $('#hint').disabled = !this.myTurn();
        document.querySelectorAll('.recommended').forEach(el => el.classList.remove('recommended'));
        const hint = this.hint;
        if (!hint || this.controller?.isOnline || hint.at !== this.controller?.game.commands.length || !this.myTurn()) {
            this.hint = null;
            return;
        }
        document.querySelectorAll(`#actions [data-act="${hint.command.type}"]`).forEach(el => el.classList.add('recommended'));
    }

    afterRender() {
        const view = this.view;
        clearTimeout(this.autoTimer);
        // できることが何もなければ、少し間を置いてパスする
        if (this.myTurn() && !hasAnyAction(view, this.me)) {
            this.autoTimer = setTimeout(() => {
                if (this.myTurn() && !hasAnyAction(this.view, this.me)) this.controller?.send({ type: 'pass' });
            }, AUTO_PASS_DELAY_MS);
        }
        if (view.phase === 'end' && !$('#result').open) {
            this.recordLocalResult(view);
            clearTimeout(this.resultTimer);
            this.resultTimer = setTimeout(() => this.showResult(), RESULT_DELAY_MS);
        }
    }

    renderOpponents() {
        const view = this.view;
        const order = view.players.map((_, i) => (view.you + 1 + i) % view.players.length).filter(i => i !== view.you);
        $('#opponents').innerHTML = order.map(seat => {
            const p = view.players[seat];
            const active = view.current === seat && view.phase !== 'end';
            return `<button class="opp ${active ? 'active' : ''}" data-player="${seat}" aria-label="${escapeHtml(p.name)}の機械">
                <span class="opp-name">${escapeHtml(p.name)}</span>
                <span class="opp-pts">${p.points}</span>
                <span class="opp-sub"><span class="opp-g">${icon('build')}${p.built.length}</span><span class="opp-e">${sphere('any', { cls: 'dot' })}${countEnergy(p.energy)}</span></span>
            </button>`;
        }).join('');
    }

    renderDisplay() {
        const view = this.view;
        const me = this.me;
        const mine = this.myTurn();
        const effect = this.chainEffect();
        const sel = this.selection;
        const final = view.finalRound && view.phase !== 'end' ? '<span class="final-badge">最後の巡</span>' : '';
        $('#display').innerHTML = [3, 2, 1].map(level => {
            const deckTarget = effect === 'research' || (mine && !me.blocked.research);
            const deckSelected = sel?.kind === 'deck' && sel.level === level;
            const deck = view.deckCounts[level] > 0
                ? cardBackHtml(level, { cls: `deck ${deckSelected ? 'selected' : ''} ${effect === 'research' ? 'target' : ''} ${deckTarget ? '' : 'idle'}`, attrs: `data-deck="${level}" role="button" aria-label="レベル${level}の山札（${view.deckCounts[level]}枚）"`, count: view.deckCounts[level] })
                : '<div class="deck-empty"></div>';
            const slots = view.display[level].map((id, slot) => {
                const key = `data-slot="${level}-${slot}"`;
                if (id === null) return `<div class="slot slot-empty" ${key}></div>`;
                const affordable = mine && payOptions(view, me, id, 'display').length > 0;
                const target = (effect === 'file') || (effect === 'freeBuild' && level === 1);
                const selected = sel?.kind === 'card' && sel.card === id;
                return `<div class="slot" ${key}>${cardHtml(id, { cls: `${affordable ? 'affordable' : ''} ${selected ? 'selected' : ''} ${target ? 'target' : ''}`, attrs: 'role="button"' })}</div>`;
            }).join('');
            return `<div class="display-row lv${level}">${deck}${slots}</div>`;
        }).join('') + final;
    }

    renderRow() {
        const view = this.view;
        const mine = this.myTurn() && storageRoom(this.me) > 0;
        const target = this.chainEffect() === 'pick';
        const sel = this.selection;
        const slots = view.row.map((color, slot) => {
            if (color === null) return `<span class="row-slot empty" data-row-slot="${slot}"></span>`;
            const selected = sel?.kind === 'slot' && sel.slot === slot;
            return `<button class="row-slot ${selected ? 'selected' : ''} ${target ? 'target' : ''} ${mine || target ? 'usable' : ''}" data-pick="${slot}" data-row-slot="${slot}" aria-label="${sphereName(color)}を取る">${sphere(color)}</button>`;
        }).join('');
        $('#row').innerHTML = `<div class="row-spheres">${slots}</div>
            <span class="dispenser" data-dispenser title="ディスペンサーの残り">${icon('dispenser')}<b>${view.dispenserCount}</b></span>`;
    }

    renderMe() {
        const view = this.view;
        const me = this.me;
        const active = view.current === view.you && view.phase !== 'end';
        const mine = this.myTurn();
        const sel = this.selection;
        const pending = new Set(view.current === view.you ? view.pending.map(p => p.gizmo) : []);
        const used = new Set(view.current === view.you ? view.used : []);
        const energy = COLORS.map(c => `<span class="me-e" data-me-color="${c}">${sphere(c, { n: me.energy[c], cls: me.energy[c] === 0 ? 'empty' : '' })}</span>`).join('');
        const archive = Array.from({ length: Math.max(me.limits.archive, me.archive.length) }, (_, i) => {
            const id = me.archive[i];
            if (id === undefined) return '<div class="arch-empty"></div>';
            const affordable = mine && payOptions(view, me, id, 'archive').length > 0;
            const target = this.chainEffect() === 'freeBuild' && CARDS[id].level === 1;
            const selected = sel?.kind === 'card' && sel.card === id;
            return cardHtml(id, { cls: `mini ${affordable ? 'affordable' : ''} ${selected ? 'selected' : ''} ${target ? 'target' : ''}`, attrs: 'role="button"' });
        }).join('');
        const columns = TYPES.map(type => {
            const tiles = me.built.filter(id => CARDS[id].type === type).map(id => tileHtml(id, {
                cls: `${pending.has(id) ? 'pending' : ''} ${used.has(id) ? 'used' : ''} ${this.chainGizmo === id ? 'chosen' : ''}`
            })).join('');
            return `<div class="col" data-col="${type}"><span class="col-head" title="${TYPE_NAMES[type]}">${typeIcon(type)}</span>${tiles}</div>`;
        }).join('');
        const blocked = [me.blocked.file ? '保管なし' : '', me.blocked.research ? '研究なし' : ''].filter(Boolean).join('・');
        $('#me').className = `me ${active ? 'active' : ''}`;
        $('#me').innerHTML = `
            <div class="me-head">
                <span class="me-pts"><b>${me.points}</b>点</span>
                <span class="me-vp" data-me-vp title="得点チップ">${icon('vp')}${me.vp}</span>
                <span class="me-count" title="建てた枚数">${icon('build')}${me.built.length}/16</span>
                <span class="me-lim" title="研究の数">${icon('research')}${me.blocked.research ? '×' : me.limits.research}</span>
                ${blocked ? `<span class="me-block">${blocked}</span>` : ''}
            </div>
            <div class="me-body">
                <div class="me-energy" data-me-energy><div class="me-es">${energy}</div><span class="me-cap">${countEnergy(me.energy)}/${me.limits.storage}</span></div>
                <div class="me-archive" data-me-archive>${icon('file', 'arch-ico')}${archive}</div>
            </div>
            <div class="machine">${columns}</div>`;
    }

    renderActions() {
        const view = this.view;
        const me = this.me;
        const sel = this.selection;
        const cancel = '<button class="btn small ghost" data-act="cancel" aria-label="やめる">×</button>';
        let html;
        if (this.myTurn('chain')) {
            const chips = view.pending.map(p => {
                const chosen = this.chainGizmo === p.gizmo;
                const left = p.left === 1 && CARDS[p.gizmo].effect.amount === 2 ? '（あと1回）' : '';
                return `<button class="chain-chip ${chosen ? 'chosen' : ''}" data-act="chain" data-gizmo="${p.gizmo}">${tileHtml(p.gizmo, { cls: 'flat' })}<span>${effectText(CARDS[p.gizmo])}${left}</span></button>`;
            }).join('');
            const hint = this.chainGizmo !== null ? `<span class="chain-hint">${chainHint(CARDS[this.chainGizmo].effect.kind)}</span>` : '';
            html = `<span class="chain-chips">${chips}</span>${hint}<button class="btn small secondary" data-act="stop">終える</button>`;
        } else if (sel?.kind === 'card') {
            const options = payOptions(view, me, sel.card, sel.source);
            const pay = options.length > 0 ? options[this.payIndex % options.length] : null;
            const fileable = sel.source === 'display' && canArchive(me);
            const spend = pay ? spendHtml(pay.spend) : '';
            const change = options.length > 1 ? `<button class="btn tiny ghost" data-act="pay" aria-label="払い方を変える">${icon('convert')}</button>` : '';
            html = `<span class="act-card">${cardHtml(sel.card, { cls: 'tiny' })}</span>
                <span class="act-text">${escapeHtml(cardText(sel.card))}${pay ? `<span class="act-pay">${spend}${change}</span>` : ''}</span>
                <button class="btn small primary" data-act="build" ${pay ? '' : 'disabled'}>建てる</button>
                ${sel.source === 'display' ? `<button class="btn small secondary" data-act="file" ${fileable ? '' : 'disabled'}>保管</button>` : ''}${cancel}`;
        } else if (sel?.kind === 'slot') {
            html = `<span class="act-sphere">${sphere(view.row[sel.slot])}</span><span class="act-text">${sphereName(view.row[sel.slot])}のエネルギー</span>
                <button class="btn small primary" data-act="pick">取る</button>${cancel}`;
        } else if (sel?.kind === 'deck') {
            const n = Math.min(me.limits.research, view.deckCounts[sel.level]);
            html = `<span class="act-card">${cardBackHtml(sel.level, { cls: 'tiny' })}</span><span class="act-text">${n}枚引いて、1枚を建てるか保管する</span>
                <button class="btn small primary" data-act="research">研究</button>${cancel}`;
        } else {
            // 何も選んでいないときは、最後の出来事を1行で控えめに出す
            const last = view.logs.at(-1) ?? '';
            html = `<span class="act-log">${escapeHtml(last)}</span>`;
        }
        $('#actions').innerHTML = html;
    }

    renderResearch() {
        const dialog = $('#research');
        const view = this.view;
        if (!this.myTurn('research') || !view.research?.cards) {
            if (dialog.open) dialog.close();
            return;
        }
        const me = this.me;
        const card = this.researchCard;
        $('#research-title').textContent = `研究：レベル${view.research.level}から${view.research.count}枚`;
        $('#research-cards').innerHTML = view.research.cards.map(id => {
            const affordable = payOptions(view, me, id, 'research').length > 0;
            return cardHtml(id, { cls: `${affordable ? 'affordable' : ''} ${card === id ? 'selected' : ''}`, attrs: 'role="button"' });
        }).join('');
        let buttons = '';
        if (card !== null) {
            const options = payOptions(view, me, card, 'research');
            const pay = options.length > 0 ? options[this.payIndex % options.length] : null;
            const change = options.length > 1 ? `<button class="btn tiny ghost" data-act="pay" aria-label="払い方を変える">${icon('convert')}</button>` : '';
            $('#research-text').innerHTML = `<b>${escapeHtml(cardTitle(card))}</b><br>${escapeHtml(cardText(card))}${pay ? `<span class="act-pay">${spendHtml(pay.spend)}${change}</span>` : ''}`;
            buttons = `<button class="btn small primary" data-act="r-build" ${pay ? '' : 'disabled'}>建てる</button>
                <button class="btn small secondary" data-act="r-file" ${canArchive(me) ? '' : 'disabled'}>保管</button>`;
        } else {
            $('#research-text').textContent = '1枚を選んで、建てるか保管します';
        }
        $('#research-buttons').innerHTML = `${buttons}<button class="btn small ghost" data-act="r-skip">取らない</button>`;
        if (!dialog.open) dialog.showModal();
    }

    // ---- ダイアログ ----

    showCardDetail(id) {
        $('#card-detail-body').innerHTML = `<div class="detail-card">${cardHtml(id, { cls: 'big' })}</div>
            <h3>${escapeHtml(cardTitle(id))}</h3><p>${escapeHtml(cardText(id))}</p>`;
        if (!$('#card-detail').open) $('#card-detail').showModal();
    }

    showPlayerDetail(seat) {
        const p = this.view.players[seat];
        $('#player-detail-name').textContent = `${p.name}　${p.points}点`;
        const columns = TYPES.map(type => {
            const tiles = p.built.filter(id => CARDS[id].type === type).map(id => tileHtml(id)).join('');
            return `<div class="col"><span class="col-head" title="${TYPE_NAMES[type]}">${typeIcon(type)}</span>${tiles}</div>`;
        }).join('');
        const archive = p.archive.length ? p.archive.map(id => cardHtml(id, { cls: 'mini' })).join('') : '<span class="muted">なし</span>';
        $('#player-detail-body').innerHTML = `
            <div class="detail-line">${COLORS.map(c => sphere(c, { n: p.energy[c], cls: p.energy[c] === 0 ? 'empty' : '' })).join('')}
                <span class="me-cap">${countEnergy(p.energy)}/${p.limits.storage}</span>
                <span class="me-vp">${icon('vp')}${p.vp}</span><span class="me-count">${icon('build')}${p.built.length}/16</span></div>
            <h3>保管庫（${p.archive.length}/${p.limits.archive}）</h3><div class="detail-row">${archive}</div>
            <h3>機械</h3><div class="machine detail">${columns}</div>`;
        $('#player-detail').showModal();
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // id はシードから作る（同じ対戦を2回数えない）
    recordLocalResult(view) {
        const controller = this.controller;
        if (!controller || controller.isOnline || !view.winners?.length) return;
        if (this.recordedId === controller.game.options.seed) return;
        this.recordedId = controller.game.options.seed;
        recordResult({ game: GAME, id: `${GAME}-${controller.game.options.seed}`, outcome: outcomeFromWinners(view.winners, view.you, view.players.length) });
    }

    showResult() {
        const view = this.view;
        if (!view || view.phase !== 'end') return;
        const order = rankView(view);
        const youWon = view.winners.includes(view.you);
        $('#result-title').textContent = youWon ? 'あなたの勝ち' : `${view.players[view.winners[0]].name}の勝ち`;
        $('#result-list').innerHTML = order.map(p => `<li class="${view.winners.includes(p.id) ? 'winner' : ''}">
            <span class="r-name">${escapeHtml(p.name)}</span><span class="r-pts"><b>${p.points}</b>点</span>
            <span class="r-sub">ギズモ${p.built.length}枚・得点チップ${p.vp}・残り${countEnergy(p.energy)}個</span></li>`).join('');
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

const sphereName = (color) => ({ red: '赤', yellow: '黄', blue: '青', black: '黒' }[color] ?? '');

function spendHtml(spend) {
    const list = COLORS.flatMap(c => Array.from({ length: spend[c] }, () => sphere(c, { cls: 'dot' }))).join('');
    return list || '<b class="free">無料</b>';
}

function chainHint(kind) {
    return { pick: '光るエネルギーを選ぶ', file: '保管するギズモを選ぶ', research: '山札を選ぶ', freeBuild: 'レベル1を選ぶ' }[kind] ?? '';
}

// 結果の並び（ゲームと同じ順位の決め方）
function rankView(view) {
    const n = view.players.length;
    const far = (p) => (p.id - view.startPlayer + n) % n;
    return [...view.players].sort((a, b) => (b.points - a.points) || (b.built.length - a.built.length)
        || (countEnergy(b.energy) - countEnergy(a.energy)) || (far(b) - far(a)));
}
